import * as Monaco from 'monaco-editor'

type XRange = Pick<Monaco.Range, 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'>

interface Spellchecker {
    process: () => void
    dispose: () => void
}

interface Options {
    severity?: Monaco.MarkerSeverity
    languageSelector?: Monaco.languages.LanguageSelector
    debounceInterval?: number
    tokenize?: (text: string) => { word: string, pos: number }[] | Iterable<{ word: string, pos: number }>
    check: (word: string) => (boolean | Promise<boolean>)
    suggest: (word: string) => (string[] | Promise<string[]>)
    ignore?: (word: string) => (void | Promise<void>)
    addWord?: (word: string) => (void | Promise<void>)
    messageBuilder?: (type: 'hover-message' | 'ignore' | 'add-word' | 'apply-suggestion', word: string, range?: XRange, opts?: Options) => string
}

export const ignoreActionId = 'spellchecker.ignore';
export const addWordActionId = 'spellchecker.addWord';
export const correctActionId = 'spellchecker.correct';

function buildCommandIdForEditor(actionId: string, editorId: string) {
    return `${editorId}:${actionId}`;
}

export const defaultMessageBuilder: NonNullable<Options['messageBuilder']> = (type, word) => {
    switch (type) {
        case 'hover-message':
            return `"${word}" is misspelled.`
        case 'ignore':
            return `Ignore "${word}"`
        case 'add-word':
            return `Add "${word}" to Dictionary`
        case 'apply-suggestion':
            return `Replace with "${word}"`
        default:
            return ''
    }
}

export function *defaultTokenize (text: string) {
    const wordReg = /\b[a-zA-Z']+\b/g
    let match: RegExpExecArray | null

    while ((match = wordReg.exec(text)) !== null) {
        const { 0: word, index: pos } = match

        if (word.length < 2) continue

        yield { word, pos }
    }
}

const debounce = (callback: (...args: any) => any, wait: number) => {
    let timeoutId: number | undefined = undefined;
    return (...args: any) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
            callback(...args);
        }, wait);
    };
};

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
    const {
        check,
        suggest,
        ignore,
        addWord,
        messageBuilder = defaultMessageBuilder,
        tokenize = defaultTokenize,
        languageSelector = '*',
        debounceInterval = 500,
    } = opts;

    const owner = 'spellchecker';
    let disposed = false;
    const editorId = editor.getId();

    const process = debounce(async () => {
        if (disposed) {
            return;
        }

        const model = editor.getModel()
        if (!model) {
            return;
        }

        const marks: Monaco.editor.IMarkerData[] = [];

        const text = model.getValue();
        const lines = text.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            if (marks.length > 500) {
                // monaco editor has a limit of 500 markers.
                // https://github.com/microsoft/monaco-editor/issues/2042
                break;
            }

            const words = tokenize(lines[lineIndex]);

            for (const { word, pos } of words) {
                const startColumn = pos + 1;
                const endColumn = startColumn + word.length;

                const result = check(word);
                const isCorrect = typeof result === 'boolean' ? result : await result

                if (!isCorrect) {
                    const range = {
                        startLineNumber: lineIndex + 1,
                        startColumn,
                        endLineNumber: lineIndex + 1,
                        endColumn,
                    };

                    marks.push({
                        code: word,
                        startLineNumber: lineIndex + 1,
                        startColumn,
                        endLineNumber: lineIndex + 1,
                        endColumn,
                        message: messageBuilder('hover-message', word, range, opts),
                        severity: opts.severity || monaco.MarkerSeverity.Warning,
                    });
                }
            }
        }

        monaco.editor.setModelMarkers(model, owner, marks);
    }, debounceInterval);

    const codeActionProvider: Monaco.languages.CodeActionProvider = {
        provideCodeActions: async function(model, range, _context, token) {
            if (disposed) {
                return null;
            }

            const markers = monaco.editor.getModelMarkers({ owner: owner, resource: model.uri })
            const marker = markers.find(marker => range.containsRange.call(marker, range))
            if (!marker) {
                return null;
            }

            const actions: Monaco.languages.CodeAction[] = [];

            const word = marker.code as string;
            const list = await suggest(word);

            if (token.isCancellationRequested){
                return null;
            }

            list.forEach(suggestion => {
                actions.push({
                    title: suggestion,
                    command: {
                        id: buildCommandIdForEditor(correctActionId, editorId),
                        title: messageBuilder('apply-suggestion', suggestion, marker, opts),
                        arguments: [{
                            range: marker,
                            suggestion: suggestion,
                        }],
                    },
                    ranges: [marker],
                    kind: 'quickfix'
                })
            });

            if (ignore) {
                const title = messageBuilder('ignore', word, marker, opts)
                actions.push({
                    title,
                    command: {
                        id: buildCommandIdForEditor(correctActionId, editorId),
                        title,
                        arguments: [word],
                    },
                    ranges: [marker],
                    kind: 'quickfix'
                });
            }

            if (addWord) {
                const title = messageBuilder('add-word', word, marker, opts)
                actions.push({
                    title,
                    command: {
                        id: buildCommandIdForEditor(correctActionId, editorId),
                        title,
                        arguments: [word],
                    },
                    ranges: [marker],
                    kind: 'quickfix'
                });
            }

            return { actions, dispose: () => {} }
        },
    }

    const disposables: Monaco.IDisposable[] = [
        editor.addAction({
            id: correctActionId,
            label: 'Spellchecker: Correct',
            run: (editor, args) => {
                if (!args || !args.range || !args.suggestion) return

                const model = editor.getModel()
                if (!model) return

                const { range, suggestion } = args

                editor.pushUndoStop()
                editor.executeEdits(owner, [{
                    range,
                    text: suggestion,
                }])
            },
        }),
        monaco.languages.registerCodeActionProvider(languageSelector, codeActionProvider),
        editor.onDidChangeModelContent(() => {
            process();
        })
    ]

    if (ignore) {
        disposables.push(
            editor.addAction({
                id: ignoreActionId,
                label: 'Spellchecker: Ignore',
                run: async (_, word) => {
                    if (word) {
                        await ignore(word)
                        process()
                    }
                },
            })
        )
    }

    if (addWord) {
        disposables.push(
            editor.addAction({
                id: addWordActionId,
                label: 'Spellchecker: Add to Dictionary',
                run: async (_, word) => {
                    if (word) {
                        await addWord(word)
                        process()
                    }
                },
            })
        )
    }

    const dispose = () => {
        monaco.editor.removeAllMarkers(owner)
        disposables.forEach(disposable => disposable.dispose())
        disposables.length = 0
        disposed = true
    }

    process();
    return { process, dispose }
}
