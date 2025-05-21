/**
 * @fileoverview Type definition for MCP resources.
 */

/**
 * Represents a text-based resource in the MCP system.
 * @interface Resource
 * @property {string} uri - Unique identifier/location of the resource
 * @property {string} text - The textual content of the resource
 */
export interface Resource {
  uri: string;
  text: string;
}
