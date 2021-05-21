import { DirectiveNode } from 'graphql';
export declare function getArgValueFromDirective(directive: DirectiveNode, argName: string, defaultValue?: any): any;
export declare function findDirective<Node extends {
    directives?: readonly DirectiveNode[];
}>(node: Node, directiveName: string): DirectiveNode | undefined;
export declare function removeUndefinedValue<T extends Record<string, any>>(object: T): T;
export declare function isEmpty(object: Record<string, any> | any[]): boolean;
