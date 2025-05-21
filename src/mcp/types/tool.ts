/**
 * @fileoverview Type definitions for MCP tools and their JSON schema validation.
 */

/**
 * Represents an MCP tool with its metadata and input validation schema.
 * @interface Tool
 * @property {string} name - The unique identifier of the tool
 * @property {string} description - Human-readable description of the tool's functionality
 * @property {JSONSchema | unknown} input_schema - JSON Schema for validating tool input parameters
 */
export interface Tool {
  name: string;
  description: string;
  input_schema: JSONSchema | unknown;
}

/**
 * JSON Schema definition for validating tool input parameters.
 * @interface JSONSchema
 * @property {string} [type] - The data type of the schema
 * @property {Record<string, JSONSchemaProperty>} [properties] - Object properties and their schemas
 * @property {string[]} [required] - List of required property names
 * @property {boolean} [additionalProperties] - Whether to allow properties not defined in the schema
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * Property definition within a JSON Schema.
 * @interface JSONSchemaProperty
 * @property {string} [type] - The data type of the property
 * @property {string} [description] - Human-readable description of the property
 * @property {unknown} [default] - Default value if property is not provided
 * @property {unknown[]} [enum] - List of allowed values for the property
 * @property {string} [format] - Additional format validation (e.g., 'date-time', 'email')
 */
export interface JSONSchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  format?: string;
  [key: string]: unknown;
}

/**
 * Response from a tool execution.
 * @interface ToolResponse
 * @property {boolean} isError - Whether the execution resulted in an error
 * @property {unknown} [content] - The successful execution result
 * @property {string} [error] - Error message if execution failed
 */
export interface ToolResponse {
  isError: boolean;
  content?: unknown;
  error?: string;
}
