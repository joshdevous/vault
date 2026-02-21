import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Common typos and corrections
const CORRECTIONS: Record<string, string> = {
  // Common typos
  teh: "the",
  hte: "the",
  thier: "their",
  recieve: "receive",
  reciept: "receipt",
  occured: "occurred",
  occuring: "occurring",
  untill: "until",
  wierd: "weird",
  beleive: "believe",
  belive: "believe",
  definately: "definitely",
  definatly: "definitely",
  seperate: "separate",
  seperately: "separately",
  occassion: "occasion",
  occassionally: "occasionally",
  accomodate: "accommodate",
  acheive: "achieve",
  accross: "across",
  agressive: "aggressive",
  apparantly: "apparently",
  arguement: "argument",
  begining: "beginning",
  calender: "calendar",
  carribean: "Caribbean",
  cemetary: "cemetery",
  collegue: "colleague",
  comming: "coming",
  commited: "committed",
  concious: "conscious",
  curiousity: "curiosity",
  dissapear: "disappear",
  dissapoint: "disappoint",
  embarass: "embarrass",
  enviroment: "environment",
  existance: "existence",
  fourty: "forty",
  freind: "friend",
  goverment: "government",
  gaurd: "guard",
  happend: "happened",
  harrass: "harass",
  immediatly: "immediately",
  independant: "independent",
  knowlege: "knowledge",
  liason: "liaison",
  libary: "library",
  maintainance: "maintenance",
  millenium: "millennium",
  misspell: "misspell",
  neccessary: "necessary",
  noticable: "noticeable",
  occurance: "occurrence",
  paralel: "parallel",
  perseverance: "perseverance",
  posession: "possession",
  preceeding: "preceding",
  priviledge: "privilege",
  pronounciation: "pronunciation",
  publically: "publicly",
  questionaire: "questionnaire",
  recomend: "recommend",
  refered: "referred",
  religous: "religious",
  remeber: "remember",
  resistence: "resistance",
  seige: "siege",
  succesful: "successful",
  suprise: "surprise",
  tommorow: "tomorrow",
  tomorro: "tomorrow",
  tounge: "tongue",
  truely: "truly",
  unforseen: "unforeseen",
  unfortunatly: "unfortunately",
  vaccuum: "vacuum",
  wether: "whether",
  writting: "writing",

  // Contractions
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  wont: "won't",
  cant: "can't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  hasnt: "hasn't",
  havent: "haven't",
  hadnt: "hadn't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  ive: "I've",
  youve: "you've",
  weve: "we've",
  theyve: "they've",
  youre: "you're",
  theyre: "they're",
  were: "we're", // Note: context-dependent, might want to remove
  hes: "he's",
  shes: "she's",
  its: "it's", // Note: context-dependent
  thats: "that's",
  whats: "what's",
  whos: "who's",
  wheres: "where's",
  heres: "here's",
  theres: "there's",
  lets: "let's",
  ill: "I'll",
  youll: "you'll",
  well: "we'll", // Note: context-dependent
  theyll: "they'll",
  hed: "he'd",
  shed: "she'd",
  youd: "you'd",
  theyd: "they'd",
  wed: "we'd",
  im: "I'm",

  // Common shortcuts
  bc: "because",
  b4: "before",
  ppl: "people",
  w: "with",
  wo: "without",
  abt: "about",
  rn: "right now",
  idk: "I don't know",
  tbh: "to be honest",
  nvm: "never mind",
  omw: "on my way",
  lmk: "let me know",
  btw: "by the way",
  fyi: "for your information",
  asap: "as soon as possible",

  // Capitalization fixes
  i: "I",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
  january: "January",
  february: "February",
  march: "March",
  april: "April",
  may: "May",
  june: "June",
  july: "July",
  august: "August",
  september: "September",
  october: "October",
  november: "November",
  december: "December",
};

export const AutoCorrect = Extension.create({
  name: "autoCorrect",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("autoCorrect"),
        props: {
          handleTextInput(view, from, to, text) {
            // Only trigger on space, period, comma, etc.
            if (!/[\s.,!?;:\)]/.test(text)) {
              return false;
            }

            const { state } = view;
            const $from = state.doc.resolve(from);
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
            
            // Find the last word
            const wordMatch = textBefore.match(/(\S+)$/);
            if (!wordMatch) {
              return false;
            }

            const word = wordMatch[1];
            const wordLower = word.toLowerCase();
            
            // Check if we have a correction for this word
            const correction = CORRECTIONS[wordLower];
            if (!correction) {
              return false;
            }

            // Preserve original case pattern if word was all caps
            let finalCorrection = correction;
            if (word === word.toUpperCase() && word.length > 1) {
              finalCorrection = correction.toUpperCase();
            } else if (word[0] === word[0].toUpperCase()) {
              // Capitalize first letter if original was capitalized
              finalCorrection = correction.charAt(0).toUpperCase() + correction.slice(1);
            }

            // Calculate positions
            const wordStart = from - word.length;
            const wordEnd = from;

            // Create transaction to replace the word and add the typed character
            const tr = state.tr
              .delete(wordStart, wordEnd)
              .insertText(finalCorrection + text, wordStart);

            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
