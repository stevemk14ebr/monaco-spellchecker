# monaco-spellchecker

This library provides a simple approach to spellchecking words in the Monaco Editor. [Try it out!](https://purocean.github.io/monaco-spellchecker/)

## Installation

```bash
npm install monaco-spellchecker
```

## Dictionary Setup Using typo-js

Please install the [typo-js](https://github.com/cfinke/Typo.js) library if you want to use it as a dictionary for spellchecking.

```bash
npm install typo-js
```

## Example

Below is an example of how to create a dictionary and use it with monaco-spellchecker:

```typescript
import Typo from 'typo-js'
import { getSpellchecker } from 'monaco-spellchecker'
import affData from 'typo-js/dictionaries/en_US/en_US.aff?raw'
import wordsData from 'typo-js/dictionaries/en_US/en_US.dic?raw'

// Create dictionary
const dictionary = new Typo("en_US", affData, wordsData)

// Get Spell Checker
const spellchecker = getSpellchecker(editor, {
  misspelledWordClassName: 'misspelled-word',
  check: (word) => dictionary.check(word),
  suggest: (word) => dictionary.suggest(word),
  ignore: (word) => {
    console.log('Ignore word:', word)
    // ...existing code...
  },
  addWord: (word) => {
    console.log('Add word:', word)
    // ...existing code...
  }
})

const process = debounce(spellchecker.process, 500)

// Process the editor content after it has been changed
editor.onDidChangeModelContent(() => {
  process()
})

// Register code action provider
monaco.languages.registerCodeActionProvider('markdown', spellchecker.codeActionProvider)

// Don't forget to add the CSS style
const style = document.createElement('style')
style.textContent = `
.monaco-editor .misspelled-word {
    text-decoration: underline wavy #F44336;
}
`
document.head.appendChild(style)
```

## API Reference

### getSpellchecker(editor, options)

Returns an object with:
1. `process()`: Re-scans the editor content for misspelled words.
2. `codeActionProvider`: A Monaco code action provider for fixing misspelled words.

### Options

- `misspelledWordClassName`: CSS class for highlighting misspelled words.
- `check(word)`: A function that returns true if the word is correctly spelled.
- `suggest(word)`: A function that returns an array of suggestions.
- `ignore(word)`: Optional; handle the ignored word.
- `addWord(word)`: Optional; add a new word to your dictionary.
