import * as vscode from 'vscode';
import { SymbolKind } from 'vscode';
import * as assert from 'assert';

const ScopeSymbolKind = [
    SymbolKind.Method,
    SymbolKind.Function,
    SymbolKind.Class,
    SymbolKind.Namespace,
    SymbolKind.Module
];


class SymbolNode {
    parent?: SymbolNode;
    children: SymbolNode[];
    symbolInfo?: vscode.SymbolInformation;

    constructor(symbolinfo?: vscode.SymbolInformation) {
        this.symbolInfo = symbolinfo;
        this.children = []
    }

    public static createSymbolTree(symbols: vscode.SymbolInformation[]): SymbolNode {
        let root = new SymbolNode(null);
        let curNode = root;
        let nodeStack = [root];
        let lastNode: SymbolNode = root;
        // XXX they should be sorted by symbol provider, usually ( ˘ω˘ )
        symbols.forEach(sym => {
            let node = new SymbolNode(sym);
            curNode = lastNode;
            while (curNode) {
                if (curNode.containsNodePos(node)) {
                    curNode.addNode(node);
                    break;
                }
                curNode = curNode.parent;
            }
            lastNode = node;
        });
        return root;
    }

    public get isRoot() {
        return !this.symbolInfo;
    }

    public addNode(node: SymbolNode) {
        this.children.push(node);
        node.parent = this;
    }

    public containsNodePos(node: SymbolNode) {
        if (this.isRoot) {
            return true;
        }
        return this.symbolInfo.location.range.contains(node.symbolInfo.location.range.end);
    }

    public constaisPos(pos: vscode.Position) {
        if (this.isRoot) {
            return true;
        }
        return this.symbolInfo.location.range.contains(pos);
    }

    public getFullName() {
        if (this.isRoot) {
            return 'Global Scope';
        }
        this.symbolInfo.name;
        let node: SymbolNode = this;
        let nameList: string[] = [];
        do {
            nameList.push(node.symbolInfo.name);
            node = node.parent;
        } while (node && !node.isRoot);
        return nameList.reverse().join('.');
    }

    public *iterNodes(): Iterable<SymbolNode> {
        if (!this.isRoot) {
            yield this;
        }
        for (let child of this.children) {
            yield* child.iterNodes();
        }
    }
}


export class ScopeFinder {
    private _symbolRoot: SymbolNode;
    private _updated;

    constructor(private _doc: vscode.TextDocument) {
        this._updated = true;
    }

    public get document() {
        return this._doc;
    }

    private getSymbols(): Thenable<vscode.SymbolInformation[]> {
        assert.equal(vscode.window.activeTextEditor.document, this._doc);
        return vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', this._doc.uri);
    }

    public async getScopeSymbols() {
        let symbols = await this.getSymbols();
        let scopeSymbols = symbols.filter(sym => ScopeSymbolKind.indexOf(sym.kind) != -1);
        return scopeSymbols;
    }

    public update() {
        this._updated = true;
    }

    private async updateNode() {
        if (!this._updated) {
            return;
        }
        let symbols = await this.getScopeSymbols();
        this._symbolRoot = SymbolNode.createSymbolTree(symbols);
    }

    public async getScopeNode(pos: vscode.Position): Promise<SymbolNode> {
        await this.updateNode();
        let target: SymbolNode = this._symbolRoot;
        for (let node of this._symbolRoot.iterNodes()) {
            if (node.constaisPos(pos)) {
                target = node;
            }
        }
        return target;
    }
}


export class ScopeSymbolProvider {
    // TODO: cache necessary?
    private _scopeFinder: ScopeFinder;
    private _status: vscode.StatusBarItem;

    constructor(private _context: vscode.ExtensionContext) {
        this._status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._status.tooltip = 'Symbol Navigation';
        this._status.command = 'workbench.action.gotoSymbol';

        let editor = vscode.window.activeTextEditor;
        if (editor) {
            this._scopeFinder = new ScopeFinder(editor.document);
            this.updateStatus(editor.selection.start);
        }
        vscode.window.onDidChangeTextEditorSelection(async e => {
            if (e.selections.length < 1) {
                return;
            }
            let selection = e.selections[0];
            this.updateStatus(selection.start);
        });

        vscode.window.onDidChangeActiveTextEditor(e => {
            if (!e) {
                this.updateStatus();
                return;
            }
            this._scopeFinder = new ScopeFinder(e.document);
            this.updateStatus(e.selection.start);
        });

        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.isDirty) {
                return;
            }
            if (this._scopeFinder && e.document === this._scopeFinder.document) {
                this._scopeFinder.update();
                return;
            }
            this._scopeFinder = new ScopeFinder(e.document);
        });
    }

    private async updateStatus(pos?: vscode.Position) {
        if (!pos) {
            this._status.hide();
            return;
        }
        let node = await this._scopeFinder.getScopeNode(pos);
        if (!node) {
            this._status.hide();
        }
        this._status.text = node.getFullName();
        this._status.show();
    }
}
