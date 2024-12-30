import type * as monaco from 'monaco-editor'

type XRange = Pick<monaco.Range, 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'>

interface Spellchecker {
    process: () => void
    codeActionProvider: monaco.languages.CodeActionProvider
}

interface Options {
    misspelledWordClassName: string
    // generator or function
    tokenize?: (text: string) => { word: string, pos: number }[] | Iterable<{ word: string, pos: number }>
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

function *defaultTokenize (text: string) {
    const wordReg = /\b[a-zA-Z']+\b/g
    let match: RegExpExecArray | null

    while ((match = wordReg.exec(text)) !== null) {
        const { 0: word, index: pos } = match

        if (word.length < 2) continue

        yield { word, pos }
    }
}

/**
 * Initialize the spellchecker for the Monaco Editor.
 *
 * @param editor - The Monaco Editor instance.
 * @param opts - The options for the spellchecker.
 */
export function getSpellchecker(
    editor: monaco.editor.IStandaloneCodeEditor,
    opts: Options
): Spellchecker {

    const decorations = editor.createDecorationsCollection([])

    const { check, suggest, ignore, addWord, buildHoverMessage = defaultBuildHoverMessage, tokenize = defaultTokenize } = opts

    const process = () => {
        const model = editor.getModel()
        if (!model) return

        const newDecorations: monaco.editor.IModelDeltaDecoration[] = []

        const text = model.getValue()
        const lines = text.split('\n')

        lines.forEach((line, lineIndex) => {
            const words = tokenize(line)

            for (const { word, pos } of words) {
                const startColumn = pos + 1
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

            editor.pushUndoStop()
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
