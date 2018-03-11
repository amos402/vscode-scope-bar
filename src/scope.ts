import * as vscode from 'vscode';
import { SymbolKind } from 'vscode';
import * as assert from 'assert';

const ScopeSymbolKind = [
    SymbolKind.Method,
    SymbolKind.Function,
    SymbolKind.Class,
    SymbolKind.Namespace,
    SymbolKind.Module,
    SymbolKind.Constructor
];


class SymbolNode {
    parent?: SymbolNode;
    children: SymbolNode[];
    symbolInfo?: vscode.SymbolInformation;
    _range?: vscode.Range;

    constructor(symbolinfo?: vscode.SymbolInformation) {
        this.symbolInfo = symbolinfo;
        this.children = []
    }

    public static createSymbolTree(symbols: vscode.SymbolInformation[]): SymbolNode {
        let root = new SymbolNode(null);
        let lastNode: SymbolNode = root;

        // Some language servers provide a symbol.location.range that covers only the symbol
        // _name_, not the _body_ of the corresponding class/function/etc. Such ranges are not
        // "proper" and are useless for our purpose of checking symbol nesting.
        // If we don't have proper ranges:
        // - we fallback to heuristics in containsNode()
        // - we compute approximate ranges in computeChildrenRange()
        //
        // We detect such cases by checking whether all symbols cover just a single line.
 
        let properRanges = symbols.find(sym => sym.location.range.start.line != sym.location.range.end.line) != null;

        // XXX they should be sorted by symbol provider, usually ( ˘ω˘ )
        symbols.forEach(sym => {
            let node = new SymbolNode(sym);
            let curNode = lastNode;
            while (curNode) {
                if (curNode.containsNode(properRanges, node)) {
                    curNode.addNode(node);
                    break;
                }
                curNode = curNode.parent;
            }
            lastNode = node;
        });
 
        if (!properRanges) {
            root._range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1e10, 0)); // whole file
            root.computeChildRanges();
        }
 
        return root;
    }

    private computeChildRanges() {
        // Approximate ranges if we don't have real ones.

        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            
            // start: at the first character of the symbol's line (keywords typically appear before a function name)
            let start = new vscode.Position(child.symbolInfo.location.range.start.line, 0);
            
            // end: either at the start of the node's next sibling (if any), or at the end of the node's parent
            let end;
            if (i+1 < this.children.length) {
                end = this.children[i+1].symbolInfo.location.range.start;
            } else {
                end = this._range.end;
            }

            child._range = new vscode.Range(start, end);
            child.computeChildRanges();
        }
    }

    public get isRoot() {
        return !this.symbolInfo;
    }

    private get kind() {
        return this.symbolInfo ? this.symbolInfo.kind : SymbolKind.Null;
    }

    private get range() {
        return this._range || this.symbolInfo.location.range;
    }

    public addNode(node: SymbolNode) {
        this.children.push(node);
        node.parent = this;
    }

    private containsNode(properRanges: Boolean, node: SymbolNode) {
        if (this.isRoot) {
            return true;
        } else if (properRanges) {
            return this.range.contains(node.symbolInfo.location.range.end);
        } else {
            // No proper ranges, fallback to heuristics.
            // Assume no nested namespaces/classes/functions.

            switch (this.kind) {
                case SymbolKind.Namespace:
                    return node.kind != SymbolKind.Namespace;
                    
                case SymbolKind.Class:
                case SymbolKind.Module:
                    return node.kind == SymbolKind.Function ||
                           node.kind == SymbolKind.Method   ||
                           node.kind == SymbolKind.Constructor;
 
                default:        // Method | Function | Constructor
                    return false;
            }
        }
    }

    public containsPos(pos: vscode.Position) {
        if (this.isRoot) {
            return true;
        }
        return this.range.contains(pos);
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

    public *iterNodesRevers(): Iterable<SymbolNode> {
        const len = this.children.length;
        for (let index = len - 1; index >= 0; index--) {
            yield* this.children[index].iterNodesRevers();
        }
        yield this;
    }
}


class CancelUpdateError implements Error {
    public name:string = 'CancelUpdateError';
    constructor(public message: string){

    }
}

export class ScopeFinder {
    private _symbolRoot: SymbolNode;
    private _updated;
    private _cancelToken: vscode.CancellationTokenSource;
    private static _dummyNode = new SymbolNode(null);

    constructor(private _doc: vscode.TextDocument) {
        this._updated = true;
    }

    public get dummyNode() {
        return ScopeFinder._dummyNode;
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
        if (this._cancelToken) {
            this._cancelToken.cancel();
        }
        this._cancelToken = new vscode.CancellationTokenSource();
        let token = this._cancelToken.token;
        // FIXME: need update flag and CancellationToken both same time?
        this._updated = false;
        let symbols = await this.getScopeSymbols();
        if (token.isCancellationRequested) {
            throw new CancelUpdateError ("CancellationRequested");
        }
        if (symbols.length == 0) {
            this._updated = true;
        }
        this._symbolRoot = SymbolNode.createSymbolTree(symbols);
    }

    public async getScopeNode(pos: vscode.Position): Promise<SymbolNode> {
        await this.updateNode();
        if (!this._symbolRoot) {
            return null;
        }
        let target: SymbolNode = null;
        for (let node of this._symbolRoot.iterNodesRevers()) {
            if (node.containsPos(pos)) {
                target = node;
                break;
            }
        }
        return target;
    }
}


export class ScopeSymbolProvider {
    // TODO: cache necessary?
    private _scopeFinder: ScopeFinder;
    private _status: vscode.StatusBarItem;

    private _lastSelection: [vscode.TextDocument, vscode.Position];
    private _lastPos: vscode.Position;
    private _cancelToken: vscode.CancellationTokenSource;

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
            this._lastPos = null;
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

    private updateStatus(pos?: vscode.Position, delay?: number) {
        if (this._cancelToken) {
            this._cancelToken.cancel();
        }
        this._cancelToken = new vscode.CancellationTokenSource();
        setTimeout(async(token: vscode.CancellationToken) =>{
            if (token.isCancellationRequested) {
                return;
            }
            if (!pos) {
                this._status.hide();
                return;
            }
            if(this._lastPos == pos) {
                return;
            }
            let node: SymbolNode;
            try {
                node = await this._scopeFinder.getScopeNode(pos);
            } catch (err) {
                if (err.name == 'CancelUpdateError'){
                    return;
                }
                throw err;
            }
            if (!node) {
                // The updateNode call may reject by timeout, use an empyty node for now
                // and refresh the status next time
                node = this._scopeFinder.dummyNode;
                this.updateStatus(pos, 1000);
            }
            this._status.text = node.getFullName();
            this._status.show();
            
        }, delay ? delay : 32, this._cancelToken.token);
    }
}
