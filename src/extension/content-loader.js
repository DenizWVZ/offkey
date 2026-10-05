// Chrome runs content scripts as plain single-file scripts. This one loads the widget script
// (content.js) from the extension as a module, so the build can split it into files as usual.
import(chrome.runtime.getURL('content.js'))
