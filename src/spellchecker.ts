import * as Monaco from 'monaco-editor'

type XRange = Pick<Monaco.Range, 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'>

interface Spellchecker {
    process: () => void
    codeActionProvider: Monaco.languages.CodeActionProvider
}

interface Options {
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

function defaultBuildHoverMessage (word: string) {
    return `"${word}" is misspelled.`
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
    monaco: typeof Monaco,
    editor: Monaco.editor.IStandaloneCodeEditor,
    opts: Options
): Spellchecker {

    const { check, suggest, ignore, addWord, buildHoverMessage = defaultBuildHoverMessage, tokenize = defaultTokenize } = opts

    const process = () => {
        const model = editor.getModel()
        if (!model) return

        const marks: Monaco.editor.IMarkerData[] = []

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

                    marks.push({
                        code: word,
                        startLineNumber: lineIndex + 1,
                        startColumn,
                        endLineNumber: lineIndex + 1,
                        endColumn,
                        message: buildHoverMessage(word, range, opts),
                        severity: 2,
                    })
                }
            }
        })

        monaco.editor.setModelMarkers(model, 'spellchecker', marks)
    }

    const codeActionProvider: Monaco.languages.CodeActionProvider = {
        provideCodeActions: function(model, range) {
            const markers = monaco.editor.getModelMarkers({ owner: 'spellchecker', resource: model.uri })
            const marker = markers.find(marker => range.containsRange.call(marker, range))
            if (!marker) {
                return null
            }

            const actions: Monaco.languages.CodeAction[] = []

            const word = marker.code as string

            suggest(word).forEach(suggestion => {
                actions.push({
                    title: suggestion,
                    command: {
                        id: buildCustomEditorId(correctActionId),
                        title: `Replace with "${suggestion}"`,
                        arguments: [{
                            range: marker,
                            suggestion: suggestion,
                        }],
                    },
                    ranges: [marker],
                    kind: 'quickfix'
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
                    ranges: [marker],
                    kind: 'quickfix'
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
                    ranges: [marker],
                    kind: 'quickfix'
                })
            }


            return { actions, dispose: () => {} }
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

    return {
        process,
        codeActionProvider: codeActionProvider
    }
}
