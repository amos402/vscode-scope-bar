//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as myExtension from '../src/extension';
import * as scope from '../src/scope';
import * as path from 'path';

function getDataFilePath(...paths: string[]): string {
    return path.join(__dirname, '..', '..', 'test', 'test_data', ...paths);
}

function sleep(time: number) {
    return new Promise<void>((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, time);
    });
}

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", () => {
    setup(done => {
        vscode.commands.executeCommand('workbench.action.closeAllEditors')
            .then(done);
    });

    teardown(done => {
        vscode.commands.executeCommand('workbench.action.closeAllEditors')
            .then(done);
    });

    async function openTestDocument(file: string) {
        const filePath = getDataFilePath(file);
        let document = await vscode.workspace.openTextDocument(filePath);
        let editor = await vscode.window.showTextDocument(document);
        return editor;
    }

    test('GetSymbol', async () => {
        const editor = await openTestDocument('file1.py');
        let finder = new scope.ScopeFinder(editor.document);
        let symbols = await finder.getScopeSymbols();
        assert.equal(symbols.length, 3);
        assert.equal(symbols[0].name, 'A');
        assert.equal(symbols[1].name, 'func');
        assert.equal(symbols[2].name, 'global_func');
    });

    test('GetScopeName', async () => {
        const editor = await openTestDocument('file1.py');
        let pos = new vscode.Position(5, 0);
        let finder = new scope.ScopeFinder(editor.document);
        let node = await finder.getScopeNode(pos);
        assert.equal(node.symbolInfo.name, 'func');
        assert.equal(node.getFullName(), 'A.func');
    });

    test('ClosureName', async () => {
        const editor = await openTestDocument('file2.py');
        let pos = new vscode.Position(11, 0);
        let finder = new scope.ScopeFinder(editor.document);
        let node = await finder.getScopeNode(pos);
        assert.equal(node.getFullName(), 'A.func1.inner.A.func1');
    });

});