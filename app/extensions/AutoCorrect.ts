import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Typo from "typo-js";

let dictionary: Typo | null = null;
let dictionaryLoading = false;

// Load dictionary asynchronously
async function loadDictionary(): Promise<Typo | null> {
  if (dictionary) return dictionary;
  if (dictionaryLoading) return null;
  
  dictionaryLoading = true;
  
  try {
    const [affResponse, dicResponse] = await Promise.all([
      fetch("/dictionaries/en_GB.aff"),
      fetch("/dictionaries/en_GB.dic"),
    ]);
    
    const [affData, dicData] = await Promise.all([
      affResponse.text(),
      dicResponse.text(),
    ]);
    
    dictionary = new Typo("en_GB", affData, dicData);
    console.log("Dictionary loaded successfully");
    return dictionary;
  } catch (error) {
    console.error("Failed to load dictionary:", error);
    dictionaryLoading = false;
    return null;
  }
}

// Start loading immediately
loadDictionary();

export const AutoCorrect = Extension.create({
  name: "autoCorrect",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("autoCorrect"),
        props: {
          handleTextInput(view, from, to, text) {
            // Only trigger on space or punctuation (word completed)
            if (!/[\s.,!?;:\)]/.test(text)) {
              return false;
            }

            // Don't do anything if dictionary isn't loaded yet
            if (!dictionary) {
              return false;
            }

            const { state } = view;
            const $from = state.doc.resolve(from);
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
            
            // Find the last word (only letters, no numbers/special chars)
            const wordMatch = textBefore.match(/([a-zA-Z]+)$/);
            if (!wordMatch) {
              return false;
            }

            const word = wordMatch[1];
            
            // Skip very short words (1-2 chars) - too risky
            if (word.length < 3) {
              return false;
            }
            
            // Check if word is spelled correctly
            if (dictionary.check(word)) {
              return false;
            }

            // Get suggestions
            const suggestions = dictionary.suggest(word);
            if (!suggestions || suggestions.length === 0) {
              return false;
            }

            // Use the first suggestion (most likely correction)
            let correction = suggestions[0];

            // Preserve case pattern
            if (word === word.toUpperCase()) {
              correction = correction.toUpperCase();
            } else if (word[0] === word[0].toUpperCase()) {
              correction = correction.charAt(0).toUpperCase() + correction.slice(1);
            }

            // Calculate positions
            const wordStart = from - word.length;
            const wordEnd = from;

            // Create transaction to replace the word and add the typed character
            const tr = state.tr
              .delete(wordStart, wordEnd)
              .insertText(correction + text, wordStart);

            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
