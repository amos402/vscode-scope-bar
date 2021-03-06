# Scope Bar
A Visual Studio Code Extension for showing the scope symbol name of the cursor on status bar.

> Note: Notice that it didn't provider any symbol service. It depend on your language extension whitch registered a `documentSymbolProvider`.
For more detail, see https://code.visualstudio.com/docs/extensionAPI/language-support#_show-all-symbol-definitions-within-a-document

## Features
1. Showing scope symbol name.

![feature-1](https://github.com/amos402/vscode-scope-bar/raw/master/images/feature-1.jpg)

2. Navigate methods on current class.
    * Deafault keybinding: `ctrl + alt + p`
    * Configration for command for click status: `scopebar.Navigate`
        * `ScopeSymbol`: The effect as follows
        * `FileSymbol`: Goto file symbol, just like command by `@`.  

![feature-2](https://github.com/amos402/vscode-scope-bar/raw/master/images/feature-2.gif)


## [Download](https://marketplace.visualstudio.com/items?itemName=amos402.scope-bar)

## [Change Log](https://github.com/amos402/vscode-scope-bar/blob/master/CHANGELOG.md)

## Source
[GitHub](https://github.com/amos402/vscode-scope-bar)

## License
[MIT](https://github.com/amos402/vscode-scope-bar/blob/master/LICENSE)
