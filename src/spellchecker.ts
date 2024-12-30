import type * as monaco from 'monaco-editor'

type XRange = Pick<monaco.Range, 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'>

interface Spellchecker {
    process: () => void
    codeActionProvider: monaco.languages.CodeActionProvider
}

interface Options {
    misspelledWordClassName: string
    check: (word: string) => boolean
    suggest: (word: string) => string[]
    ignore?: (word: string) => void
    addWord?: (word: string) => void
    buildHoverMessage?: (word: string, range: XRange, opts: Options) => string
}

export const quickFixActionId = 'spellchecker.quickfix'
export const ignoreActionId = 'spellchecker.ignore'
export const addWordActionId = 'spellchecker.addWord'
export const correctActionId = 'spellchecker.correct'

function buildCustomEditorId (actionId: string) {
    return `vs.editor.ICodeEditor:1:${actionId}`
}

function defaultBuildHoverMessage (word: string, range: XRange) {
    return `"${word}" is misspelled.

[Quick Fix](command:${buildCustomEditorId(quickFixActionId)}?${encodeURIComponent(JSON.stringify({ range }))} "Quick Fix")`
}

/**
 * Initialize the spellchecker for the Monaco Editor.
 *
 * @param editor - The Monaco Editor instance.
 * @param check - Function to check if a word is spelled correctly.
 * @param suggest - Function to provide suggestions for a misspelled word.
 * @param ignore - Optional function to ignore a word. If not provided, the default behavior is to hide the ignore button.
 * @param addWord - Optional function to add a word to the dictionary. If not provided, the default behavior is to hide the add button.
 */
export function getSpellchecker(
    editor: monaco.editor.IStandaloneCodeEditor,
    opts: Options
): Spellchecker {

    const decorations = editor.createDecorationsCollection([])

    const { check, suggest, ignore, addWord, buildHoverMessage = defaultBuildHoverMessage } = opts

    const process = () => {
        const model = editor.getModel()
        if (!model) return

        const newDecorations: monaco.editor.IModelDeltaDecoration[] = []

        const text = model.getValue()
        const lines = text.split('\n')

        lines.forEach((line, lineIndex) => {
            const wordReg = /\b\w+\b/g
            let match: RegExpExecArray | null
            while ((match = wordReg.exec(line)) !== null) {
                const word = match[0]
                const startColumn = match.index + 1
                const endColumn = startColumn + word.length

                if (!check(word)) {
                    const range = {
                        startLineNumber: lineIndex + 1,
                        startColumn,
                        endLineNumber: lineIndex + 1,
                        endColumn,
                    }

                    newDecorations.push({
                        range,
                        options: {
                            isWholeLine: false,
                            inlineClassName: 'misspelled-word',
                            hoverMessage: {
                                isTrusted: true,
                                value: buildHoverMessage(word, range, opts),
                            },
                        },
                    })
                }
            }
        })

        decorations.set(newDecorations)
    }

    const codeActionProvider: monaco.languages.CodeActionProvider = {
        provideCodeActions: (model, range) => {
            let decorationRange: monaco.Range | null = null

            for (let i = 0; i < decorations.length; i++) {
                const r = decorations.getRange(i)
                if (r?.containsRange(range)) {
                    decorationRange = r
                    break
                }
            }

            if (!decorationRange) return null

            const word = model.getValueInRange(decorationRange)
            const actions: monaco.languages.CodeAction[] = []

            suggest(word).forEach(suggestion => {
                actions.push({
                    title: suggestion,
                    command: {
                        id: buildCustomEditorId(correctActionId),
                        title: `Replace with "${suggestion}"`,
                        arguments: [{
                            range: decorationRange,
                            suggestion: suggestion,
                        }],
                    },
                    ranges: [decorationRange],
                })
            })

            if (ignore) {
                const title = `Ignore "${word}"`
                actions.push({
                    title,
                    command: {
                        id: buildCustomEditorId(ignoreActionId),
                        title,
                        arguments: [word],
                    },
                    ranges: [decorationRange],
                })
            }

            if (addWord) {
                const title = `Add "${word}" to Dictionary`
                actions.push({
                    title,
                    command: {
                        id: buildCustomEditorId(addWordActionId),
                        title,
                        arguments: [word],
                    },
                    ranges: [decorationRange],
                })
            }

            return {
                actions,
                dispose: () => { },
            }
        },
    }

    editor.addAction({
        id: quickFixActionId,
        label: 'Spellchecker: Quick Fix',
        run: (editor, args) => {
            if (!args || !args.range) return

            editor.setPosition({
                lineNumber: args.range.endLineNumber,
                column: args.range.endColumn,
            })

            editor.trigger('spellchecker', 'editor.action.quickFix', null)
        },
    })

    editor.addAction({
        id: correctActionId,
        label: 'Spellchecker: Correct',
        run: (editor, args) => {
            if (!args || !args.range || !args.suggestion) return

            const model = editor.getModel()
            if (!model) return

            const { range, suggestion } = args

            editor.executeEdits('spellchecker', [{
                range,
                text: suggestion,
            }])
        },
    })

    if (ignore) {
        editor.addAction({
            id: ignoreActionId,
            label: 'Spellchecker: Ignore',
            run: (_, word) => {
                if (word) {
                    ignore(word)
                    process()
                }
            },
        })
    }

    if (addWord) {
        editor.addAction({
            id: addWordActionId,
            label: 'Spellchecker: Add to Dictionary',
            run: (_, word) => {
                if (word) {
                    addWord(word)
                    process()
                }
            },
        })
    }

    // const triggerQuickFixAction =

    return {
        process,
        codeActionProvider
    }
}
