import { Kind } from 'graphql';
import { Transformer, InvalidDirectiveError, TransformerContractError, gql, } from 'graphql-transformer-core';
import { ResolverResourceIDs, ModelResourceIDs, isNonNullType, makeInputValueDefinition, unwrapNonNull, } from 'graphql-transformer-common';
import { printBlock, compoundExpression, qref } from 'graphql-mapping-template';
import { findDirective, getArgValueFromDirective, isEmpty, removeUndefinedValue } from './utils';
export class AutoTransformer extends Transformer {
    constructor() {
        super('AutoTransformer', gql `
        directive @auto(creatable: Boolean = false, updatable: Boolean = false) on FIELD_DEFINITION
      `);
        this.templateParts = {};
        this.field = (parent, fieldDefinition, directive, ctx) => {
            var _a;
            if (parent.kind === Kind.INTERFACE_TYPE_DEFINITION) {
                throw new InvalidDirectiveError(`The @auto directive cannot be placed on an interface's field. See ${parent.name.value}${fieldDefinition.name.value}`);
            }
            const modelDirective = findDirective(parent, 'model');
            if (!modelDirective) {
                throw new InvalidDirectiveError('Types annotated with @auto must also be annotated with @model.');
            }
            if (!isNonNullType(fieldDefinition.type)) {
                throw new TransformerContractError(`@auto directive can only be used on non-nullable type fields`);
            }
            const objectTypeName = parent.name.value;
            const creatable = getArgValueFromDirective(directive, 'creatable', false);
            const updatable = getArgValueFromDirective(directive, 'updatable', false);
            this.updateCreateInput(ctx, objectTypeName, fieldDefinition, creatable);
            this.updateUpdateInput(ctx, objectTypeName, fieldDefinition, updatable);
            // @key directive generates VTL code before @model does.
            // There are three cases @key trie to use automatic variables before they're defined.
            // 1. An automatic generated variable is a part of composite primary key:
            //   @key(fields: ["hash", "createdAt"]
            // 2. An automatic generated variable is a part of range key:
            //   @key(name: "byThing", fields: ["hash", "sender", "createdAt"]
            // 3. An automatic generated variable satisfy 1 and 2.
            // To handle this problem, We generate automatic variables by ourselves.
            const keyDirectives = (_a = parent.directives) === null || _a === void 0 ? void 0 : _a.filter((directive) => directive.name.value === 'key');
            if (!keyDirectives) {
                return;
            }
            let useUpdatedAtField = false;
            let useTypeName = false;
            let useOwner = false;
            let ownerField = 'owner';
            let ownerFields = [];
            const authDirective = findDirective(parent, 'auth');
            if (authDirective) {
                const rules = getArgValueFromDirective(authDirective, 'rules');
                ownerFields = rules.map((rule) => rule.ownerField || 'owner');
            }
            const defaultTimestampConfig = {
                updatedAt: 'updatedAt',
            };
            const timestampConfig = {
                ...defaultTimestampConfig,
                ...removeUndefinedValue(getArgValueFromDirective(modelDirective, 'timestamps', {})),
            };
            const currentFieldName = fieldDefinition.name.value;
            for (const keyDirective of keyDirectives) {
                const keyFields = getArgValueFromDirective(keyDirective, 'fields');
                const isPrimaryIndex = !getArgValueFromDirective(keyDirective, 'name');
                if (!keyFields || !isPrimaryIndex || !keyFields.includes(currentFieldName)) {
                    continue;
                }
                if (currentFieldName === timestampConfig.updatedAt) {
                    useUpdatedAtField = true;
                    continue;
                }
                const ownerFieldFound = keyFields.find((field) => ownerFields.includes(field));
                if (currentFieldName === ownerFieldFound) {
                    ownerField = ownerFieldFound;
                    useOwner = true;
                    continue;
                }
                if (currentFieldName === '__typename') {
                    useTypeName = true;
                }
            }
            if (!useUpdatedAtField && !useTypeName && !useOwner) {
                return;
            }
            if (!this.templateParts[objectTypeName]) {
                this.templateParts[objectTypeName] = {};
            }
            if (useUpdatedAtField) {
                this.templateParts[objectTypeName].updatedAt = qref(`$context.args.input.put("${timestampConfig.updatedAt}", $util.defaultIfNull($ctx.args.input.${timestampConfig.updatedAt}, $util.time.nowISO8601()))`);
                return;
            }
            if (useTypeName) {
                this.templateParts[objectTypeName].__typename = qref(`$context.args.input.put("__typename", "${objectTypeName}")`);
            }
            if (useOwner) {
                const identityValue = `$util.defaultIfNull($ctx.identity.claims.get("username"), $util.defaultIfNull($ctx.identity.claims.get("cognito:username"), "___xamznone____"))`;
                this.templateParts[objectTypeName].owner = qref(`$context.args.input.put("${ownerField}", $util.defaultIfNull($ctx.args.input.get("${ownerField}"), ${identityValue}))`);
            }
        };
        this.after = (ctx) => {
            const templatePartsForObjectTypes = this.templateParts;
            if (isEmpty(templatePartsForObjectTypes)) {
                return;
            }
            for (const objectTypeName in templatePartsForObjectTypes) {
                const templateParts = templatePartsForObjectTypes[objectTypeName];
                const templateForCreateResolver = [templateParts.owner, templateParts.__typename].filter(Boolean);
                const templateForUpdateResolver = [templateParts.owner, templateParts.updatedAt, templateParts.__typename].filter(Boolean);
                if (templateForCreateResolver.length) {
                    const createResolverResourceId = ResolverResourceIDs.DynamoDBCreateResolverResourceID(objectTypeName);
                    this.updateResolver(ctx, createResolverResourceId, printBlock(`[@auto] Prepare DynamoDB PutItem Request`)(compoundExpression(templateForCreateResolver)));
                }
                if (templateForUpdateResolver.length) {
                    const updateResolverResourceId = ResolverResourceIDs.DynamoDBUpdateResolverResourceID(objectTypeName);
                    this.updateResolver(ctx, updateResolverResourceId, printBlock(`[@auto] Prepare DynamoDB UpdateItem Request`)(compoundExpression(templateForUpdateResolver)));
                }
            }
        };
        this.updateResolver = (ctx, resolverResourceId, code) => {
            const resolver = ctx.getResource(resolverResourceId);
            if (resolver) {
                const templateParts = [code, resolver.Properties.RequestMappingTemplate];
                resolver.Properties.RequestMappingTemplate = templateParts.join('\n\n');
                ctx.setResource(resolverResourceId, resolver);
            }
        };
    }
    updateCreateInput(ctx, typeName, autoField, nullable) {
        this.updateInput(ctx, ModelResourceIDs.ModelCreateInputObjectName(typeName), typeName, autoField, nullable);
    }
    updateUpdateInput(ctx, typeName, autoField, nullable) {
        this.updateInput(ctx, ModelResourceIDs.ModelUpdateInputObjectName(typeName), typeName, autoField, nullable);
    }
    updateInput(ctx, inputName, typeName, autoField, nullable) {
        const input = ctx.getType(inputName);
        if (!(input && input.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION && input.fields)) {
            return;
        }
        const fieldsWithoutAutoField = input.fields.filter((field) => field.name.value !== autoField.name.value);
        const fieldsWithNullableAutoField = input.fields.map((field) => {
            if (field.name.value === autoField.name.value) {
                return makeInputValueDefinition(autoField.name.value, unwrapNonNull(autoField.type));
            }
            return field;
        });
        const updatedFields = nullable ? fieldsWithNullableAutoField : fieldsWithoutAutoField;
        if (updatedFields.length === 0 && !nullable) {
            throw new InvalidDirectiveError(`After stripping away version field "${autoField.name.value}", the create input for type "${typeName}" cannot be created with 0 fields. Add another field to type "${typeName}" to continue.`);
        }
        ctx.putType({
            ...input,
            fields: updatedFields,
        });
    }
}
//# sourceMappingURL=AutoTransformer.js.map