import { ObjectTypeDefinitionNode, DirectiveNode, InterfaceTypeDefinitionNode, FieldDefinitionNode } from 'graphql';
import { Transformer, TransformerContext } from 'graphql-transformer-core';
export declare class AutoTransformer extends Transformer {
    private templateParts;
    constructor();
    field: (parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode, fieldDefinition: FieldDefinitionNode, directive: DirectiveNode, ctx: TransformerContext) => void;
    after: (ctx: TransformerContext) => void;
    private updateCreateInput;
    private updateUpdateInput;
    private updateInput;
    private updateResolver;
}
