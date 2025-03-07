import * as monaco from 'monaco-editor'
import { defaultMessageBuilder, getSpellchecker } from './spellchecker'
import Typo from 'typo-js'
import affData from 'typo-js/dictionaries/en_US/en_US.aff?raw'
import wordsData from 'typo-js/dictionaries/en_US/en_US.dic?raw'
import { Mutex } from 'async-mutex';

const container = document.querySelector<HTMLDivElement>('#app')!;

container.style.width = '100vw';
container.style.height = '100vh';

const value = `# My English Essay

This is a sample essay writte in English. It demonstrates the basic features of the Monaco Editor with Markdown syntax highlighting.

## Introduction

The purpose of this essay is to showcase the integratio of the Monaco Editor into a web application.

## Body

The Monaco Edito is a powerful code editor that can be used for various programming languages and text formats. In this example, we are using it to write a simple essay in Markdown.

## Conclusion

Integrating the Monaco Editor into your web application can greatly enhance the user experience by providing a robust and feature-rich text editing environment.`

const editor = monaco.editor.create(container, {
  value,
  language: 'markdown'
});

let _wordsData = wordsData;
let _affData = affData;

// consider nspell instead if performance is an issue
let dictionary = new Typo("en_US", _affData, _wordsData);
let dictionaryMutex = new Mutex();

// be sure to handle the dispose of the spellchecker when used in a react component!
const spellchecker = getSpellchecker(monaco, editor, {
  severity: monaco.MarkerSeverity.Info,
  check: async word => {
    return await dictionaryMutex.runExclusive(async () => {
      return dictionary.check(word)
    });
  },
  suggest: async word => {
    return await dictionaryMutex.runExclusive(async () => {
      return dictionary.suggest(word);
    });
  },
  ignore: async word => {
    console.log(`Ignoring: ${word}`)
    await dictionaryMutex.runExclusive(async () => {
      _wordsData += `\n${word}`
      dictionary = new Typo("en_US", _affData, _wordsData)
    });
  },
  addWord: async word => {
    console.log(`Adding: ${word}`)
    await dictionaryMutex.runExclusive(async () => {
      _wordsData += `\n${word}`
      dictionary = new Typo("en_US", _affData, _wordsData)
    });
  },
  messageBuilder(type, word) {
    return defaultMessageBuilder(type, word).replace('Dictionary', 'Custom Dictionary')
  },
});

// Adjust the editor layout when the window is resized
window.addEventListener('resize', () => {
  editor.layout();
});

window.addEventListener('unload', () => {
  spellchecker.dispose();
});
