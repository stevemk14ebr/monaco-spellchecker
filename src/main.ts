import * as monaco from 'monaco-editor'
import { getSpellchecker } from './spellchecker'
import Typo from 'typo-js'
import affData from 'typo-js/dictionaries/en_US/en_US.aff?raw'
import wordsData from 'typo-js/dictionaries/en_US/en_US.dic?raw'

const container = document.querySelector<HTMLDivElement>('#app')!

container.style.width = '100vw'
container.style.height = '100vh'

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
})

let _wordsData = wordsData
let _affData = affData

let dictionary = new Typo("en_US", _affData, _wordsData)

const spellchecker = getSpellchecker(monaco, editor, {
  severity: monaco.MarkerSeverity.Info,
  check: word => {
    return dictionary.check(word)
  },
  suggest: word => {
    return dictionary.suggest(word)
  },
  ignore: (word) => {
    console.log(`Ignoring: ${word}`)
    _wordsData += `\n${word}`
    dictionary = new Typo("en_US", _affData, _wordsData)
    spellchecker.dispose()
  },
  addWord: (word) => {
    console.log(`Adding: ${word}`)
    _wordsData += `\n${word}`
    dictionary = new Typo("en_US", _affData, _wordsData)

    return new Promise(r => setTimeout(r, 500))
  }
})

const process = debounce(spellchecker.process, 500)

process()
editor.onDidChangeModelContent(() => {
  process()
})

function debounce (fn: Function, delay: number) {
  let timeoutId: number
  return (...args: any) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}

// Adjust the editor layout when the window is resized
window.addEventListener('resize', () => {
  editor.layout()
})
