import Ajv from 'ajv';
import { JSONSchema } from '../types/tool.js';
import { createFileLogger, type Logger } from '../../utils/logger/index.js';

// Create AJV instance with more permissive options
const ajv = new (Ajv as any)({
  allErrors: true,
  strict: false, // More permissive mode for handling diverse schemas
  validateFormats: false, // Skip format validation for better performance
  allowUnionTypes: true, // Allow union types like ['string', 'number']
});

// Try using a simpler schema setup for 2020-12
try {
  const draft2020Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://json-schema.org/draft/2020-12/schema',
    type: ['object', 'boolean'],
    title: 'Core and Validation specifications meta-schema',
    properties: {
      $id: { type: 'string', format: 'uri-reference' },
      $schema: { type: 'string', format: 'uri' },
      $ref: { type: 'string', format: 'uri-reference' },
      $defs: {
        type: 'object',
        additionalProperties: true,
        default: {},
      },
      type: {
        anyOf: [
          { enum: ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'] },
          {
            type: 'array',
            items: { enum: ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'] },
            minItems: 1,
            uniqueItems: true,
          },
        ],
      },
      required: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
        default: [],
      },
      properties: {
        type: 'object',
        additionalProperties: true,
        default: {},
      },
    },
  };

  // Register this simplified draft 2020-12 schema
  ajv.addMetaSchema(draft2020Schema);

  console.log('Added Draft 2020-12 meta schema successfully');
} catch (error) {
  console.error('Failed to add Draft 2020-12 meta schema', error);
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  fixedSchema?: JSONSchema; // If we could fix schema issues
}

export interface ParameterValidationResult {
  isValid: boolean;
  errors: string[];
  missingParams: string[];
  fixedParams?: Record<string, unknown>; // If we could fix parameter issues
}

/**
 * Makes a schema conform to JSON Schema draft 2020-12
 */
const makeDraft2020Compatible = (schema: JSONSchema): JSONSchema => {
  // Create a new object to avoid modifying the original
  const result = { ...schema };

  // Ensure basic structure for a JSON Schema
  if (!result.type) {
    result.type = 'object';
  }

  // Add $schema for 2020-12
  result.$schema = 'https://json-schema.org/draft/2020-12/schema';

  // Ensure properties is an object
  if (!result.properties) {
    result.properties = {};
  }

  // Remove deprecated keywords
  delete result.id; // deprecated in favor of $id
  delete result.definitions; // deprecated in favor of $defs

  // Convert definitions to $defs if present
  if ('definitions' in schema && typeof schema.definitions === 'object') {
    result.$defs = schema.definitions;
  }

  // Convert formats to 2020-12 compatible
  if (result.format) {
    // In draft 2020-12, format is only for annotations unless using a format-validator vocabulary
    // We'll keep it for compatibility but not rely on it for validation
  }

  return result;
};

/**
 * Validates and potentially fixes a JSON Schema
 */
export const validateSchema = async (
  schema: unknown,
  schemaName: string
): Promise<ValidationResult> => {
  const logger: Logger = createFileLogger();
  if (!schema) {
    return { isValid: true, errors: [] }; // No schema is technically valid
  }

  // Basic type checking - must be an object
  if (schema === null) {
    await logger.warn('Invalid schema - null', { schemaName });
    return {
      isValid: false,
      errors: ['Schema must be a valid JSON Schema object'],
    };
  }

  if (typeof schema !== 'object') {
    await logger.warn('Invalid schema - not an object', { schemaName });
    return {
      isValid: false,
      errors: ['Schema must be a valid JSON Schema object'],
    };
  }

  try {
    // Basic schema validation - check required fields for JSON Schema
    const typedSchema = schema as JSONSchema;
    const errors: string[] = [];
    let fixedSchema = { ...typedSchema };
    let needsFix = false;

    // Check basic schema structure
    if (!typedSchema.type) {
      errors.push('Schema missing "type" property');
      fixedSchema.type = 'object'; // Default to object type
      needsFix = true;
    }

    // Validate properties is an object if it exists
    if (
      typedSchema.properties &&
      (typeof typedSchema.properties !== 'object' || Array.isArray(typedSchema.properties))
    ) {
      errors.push('Schema "properties" must be an object');
      fixedSchema.properties = {}; // Reset to empty object
      needsFix = true;
    }

    // Validate 'required' is an array if it exists
    if (typedSchema.required !== undefined) {
      if (!Array.isArray(typedSchema.required)) {
        errors.push('Schema "required" must be an array of strings');
        if (typeof typedSchema.required === 'string') {
          // Convert single string to array
          fixedSchema.required = [typedSchema.required];
          needsFix = true;
        } else {
          // Invalid required - remove it
          delete fixedSchema.required;
          needsFix = true;
        }
      } else {
        // Check all required items are strings and exist in properties
        const nonStringItems = typedSchema.required.filter((item) => typeof item !== 'string');
        if (nonStringItems.length > 0) {
          errors.push('All items in "required" must be strings');
          fixedSchema.required = typedSchema.required.filter((item) => typeof item === 'string');
          needsFix = true;
        }

        // Check all required properties are defined in properties
        if (typedSchema.properties && fixedSchema.required) {
          const undefinedProps = fixedSchema.required.filter(
            (prop) => !typedSchema.properties?.[prop]
          );
          if (undefinedProps.length > 0) {
            errors.push(`Required properties not defined in schema: ${undefinedProps.join(', ')}`);
            fixedSchema.required = fixedSchema.required.filter(
              (prop) => typedSchema.properties?.[prop]
            );
            needsFix = true;
          }
        }
      }
    }

    // Make schema compatible with JSON Schema draft 2020-12
    fixedSchema = makeDraft2020Compatible(fixedSchema);
    needsFix = true; // Always apply the 2020-12 compatibility adjustments

    // Try to compile the schema with Ajv to catch more issues
    try {
      ajv.compile(fixedSchema);
    } catch (error) {
      errors.push(
        `Schema compilation error: ${error instanceof Error ? error.message : String(error)}`
      );

      // If we couldn't compile, try a simpler schema
      if (fixedSchema.properties) {
        // Create a minimal valid schema that follows draft 2020-12
        const minimalSchema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {},
          required: [],
        };

        // Try to salvage property definitions
        for (const [propName, propDef] of Object.entries(fixedSchema.properties)) {
          // Check if propDef is an object (but not null)
          if (propDef && typeof propDef === 'object' && !Array.isArray(propDef)) {
            minimalSchema.properties![propName] = {
              type: 'string', // Default to string
              description:
                typeof propDef.description === 'string' ? propDef.description : undefined,
            };
          }
        }

        // Add valid required properties
        if (Array.isArray(fixedSchema.required)) {
          minimalSchema.required = fixedSchema.required.filter(
            (name: string) =>
              typeof name === 'string' &&
              minimalSchema.properties &&
              name in minimalSchema.properties
          );
        }

        fixedSchema = minimalSchema;
        needsFix = true;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      fixedSchema: needsFix ? fixedSchema : undefined,
    };
  } catch (error) {
    await logger.error('Schema validation error', {
      schemaName,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      isValid: false,
      errors: [
        `Error validating schema: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

/**
 * Validates parameters against a schema
 */
export const validateParameters = async (
  schema: JSONSchema | unknown,
  parameters: Record<string, unknown>,
  toolName: string
): Promise<ParameterValidationResult> => {
  const logger: Logger = createFileLogger();

  if (!schema) {
    return { isValid: true, errors: [], missingParams: [] }; // No schema means validation passes
  }

  // Check for invalid schema
  if (schema === null) {
    return { isValid: true, errors: [], missingParams: [] }; // Invalid schema means validation passes
  }

  if (typeof schema !== 'object') {
    return { isValid: true, errors: [], missingParams: [] }; // Invalid schema means validation passes
  }

  try {
    const typedSchema = schema as JSONSchema;
    const errors: string[] = [];
    const missingParams: string[] = [];

    // Check for required parameters
    if (Array.isArray(typedSchema.required)) {
      for (const requiredParam of typedSchema.required) {
        if (!(requiredParam in parameters)) {
          missingParams.push(requiredParam);
        }
      }

      if (missingParams.length > 0) {
        errors.push(`Missing required parameters: ${missingParams.join(', ')}`);
      }
    }

    // Only validate with Ajv if we have a valid schema and parameters
    if (
      typedSchema.type &&
      typedSchema.properties &&
      Object.keys(parameters).length > 0 &&
      missingParams.length === 0
    ) {
      try {
        const validate = ajv.compile(typedSchema);
        const isValid = validate(parameters);

        if (!isValid && validate.errors) {
          for (const error of validate.errors) {
            errors.push(`${error.instancePath || 'parameter'} ${error.message}`);
          }
        }
      } catch {
        // If schema validation fails, don't fail parameter validation
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      missingParams,
    };
  } catch (error) {
    await logger.error('Parameter validation error', {
      toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      isValid: false,
      errors: [
        `Error validating parameters: ${error instanceof Error ? error.message : String(error)}`,
      ],
      missingParams: [],
    };
  }
};
