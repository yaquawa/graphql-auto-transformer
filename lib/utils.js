import { valueFromASTUntyped } from 'graphql';
export function getArgValueFromDirective(directive, argName, defaultValue) {
    if (!directive.arguments) {
        return defaultValue;
    }
    const argValue = directive.arguments.find((arg) => arg.name.value === argName);
    return argValue ? valueFromASTUntyped(argValue.value) : defaultValue;
}
export function findDirective(node, directiveName) {
    if (!node.directives) {
        return undefined;
    }
    return node.directives.find((directive) => directive.name.value === directiveName);
}
export function removeUndefinedValue(object) {
    const newObject = {};
    for (const prop in object) {
        const value = object[prop];
        if (value === undefined) {
            continue;
        }
        newObject[prop] = value;
    }
    return newObject;
}
export function isEmpty(object) {
    return !(Array.isArray(object) ? object.length : Object.keys(object).length);
}
//# sourceMappingURL=utils.js.map