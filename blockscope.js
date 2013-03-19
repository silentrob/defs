"use strict";

const esprima = require("esprima").parse;
const fs = require("fs");
const assert = require("assert");
const is = require("./lib/is");
const fmt = require("./lib/fmt");
const traverse = require("./traverse");
const Scope = require("./scope");

const src = fs.readFileSync("test-input.js");
const ast = esprima(src, {
    loc: true,
    range: true,
});

function constLet(t) {
    return is.someof(t, ["const", "let"]);
}

function varConstLet(t) {
    return is.someof(t, ["var", "const", "let"]);
}

function isNonFunctionBlock(node) {
    return node.type === "BlockStatement" && is.noneof(node.$parent.type, ["FunctionDeclaration", "FunctionExpression"]);
}

function isForWithConstLet(node) {
    return node.type === "ForStatement" && node.init && node.init.type === "VariableDeclaration" && constLet(node.init.kind);
}

function isForInWithConstLet(node) {
    return node.type === "ForInStatement" && node.left.type === "VariableDeclaration" && constLet(node.left.kind);
}

function isFunction(node) {
    return is.someof(node.type, ["FunctionDeclaration", "FunctionExpression"]);
}

function isReference(node) {
    return node.type === "Identifier" &&
        !(node.$parent.type === "VariableDeclarator" && node.$parent.id === node) && // var|let|const $
        !(node.$parent.type === "MemberExpression" && node.$parent.property === node) && // obj.$
        !(node.$parent.type === "Property" && node.$parent.key === node) && // {$: ...}
        !(node.$parent.type === "LabeledStatement" && node.$parent.label === node) && // $: ...
        !(node.$parent.type === "CatchClause" && node.$parent.param === node) && // catch($)
        !(isFunction(node.$parent) && node.$parent.id === node) && // function $(..
        !(isFunction(node.$parent) && is.someof(node, node.$parent.params)) && // function f($)..
        true;
}

function createScopes(node) {
    node.$scope = node.$parent ? node.$parent.$scope : null; // may be overridden

    if (node.type === "Program") {
        node.$scope = new Scope({
            kind: "hoist",
            node: node,
            parent: null,
        });

    } else if (isFunction(node)) {
        if (node.id) {
            assert(node.type === "FunctionDeclaration"); // no support for named function expressions yet
            assert(node.id.type === "Identifier");
            node.$parent.$scope.add(node.id.name, "fun");
        }

        node.$scope = new Scope({
            kind: "hoist",
            node: node,
            parent: node.$parent.$scope,
        });

        node.params.forEach(function(param) {
            node.$scope.add(param.name, "param");
        });

    } else if (node.type === "VariableDeclaration") {
        assert(varConstLet(node.kind));
        node.declarations.forEach(function(declarator) {
            assert(declarator.type === "VariableDeclarator");
            node.$scope.add(declarator.id.name, node.kind);
        });

    } else if (isNonFunctionBlock(node) || isForWithConstLet(node) || isForInWithConstLet(node)) {
        node.$scope = new Scope({
            kind: "block",
            node: node,
            parent: node.$parent.$scope,
        });

    } else {
        // TODO catch(e)
    }
}

function setupReferences(node) {
    if (!isReference(node)) {
        return;
    }
    node.$references = node.$scope.lookup(node.name);
//    console.log(fmt("line {0}, col {1}: {2} - {3}", node.loc.start.line, node.loc.start.column, node.name, node.$references && node.$references.node.type));
}

traverse(ast, {pre: createScopes});
traverse(ast, {pre: setupReferences});

const rootScope = ast.$scope;
rootScope.print();
//console.dir(rootScope);


//console.dir(ast);
