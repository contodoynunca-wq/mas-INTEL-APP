/**
 * Helper function to find the matching closing bracket for a given opening bracket,
 * correctly handling brackets within strings.
 * @param str The string to search in.
 * @param start The index of the opening bracket.
 * @returns The index of the matching closing bracket, or -1 if not found.
 */
function findMatchingBracket(str: string, start: number): number {
    const openChar = str[start];
    if (openChar !== '{' && openChar !== '[') {
        return -1;
    }
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 1;
    let inString = false;
    let escape = false;

    for (let i = start + 1; i < str.length; i++) {
        const char = str[i];
        
        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === openChar) {
            depth++;
        } else if (char === closeChar) {
            depth--;
        }

        if (depth === 0) {
            return i;
        }
    }
    return -1; // Not found
}

/**
 * Safely parses a JSON string, attempting to clean up common LLM-related formatting issues
 * like markdown fences, extraneous text, trailing commas, and comments.
 * @param jsonString The raw string from the AI response.
 * @param defaultValue A default value to return if parsing fails. If not provided, an error will be thrown.
 * @returns The parsed JavaScript object or array, or the default value.
 */
export function safeJsonParse<T = any>(jsonString: string, defaultValue?: T): T {
  if (typeof jsonString !== 'string') {
    const errorMsg = `safeJsonParse received non-string input: ${typeof jsonString}`;
    console.error(errorMsg, jsonString);
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(errorMsg);
  }

  let cleanedString = jsonString.trim();

  // 1. Try to extract from markdown code block first (```json ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const codeBlockMatch = cleanedString.match(codeBlockRegex);
  if (codeBlockMatch && codeBlockMatch[1]) {
      cleanedString = codeBlockMatch[1].trim();
  }
  
  // 2. Find the start of the first valid JSON object or array, ignoring anything before it.
  // We look for the first '{' or '[' that isn't part of a markdown link or random text.
  const jsonStartIndex = cleanedString.search(/[[{]/);
  
  if (jsonStartIndex === -1) {
    console.error("Robust JSON parsing failed: No JSON object or array found in the string.", { snippet: jsonString.substring(0, 200) });
    if (defaultValue !== undefined) return defaultValue;
    throw new Error("No JSON object or array found in the string.");
  }
  
  // 3. Find the end of that JSON object/array by balancing brackets
  const jsonEndIndex = findMatchingBracket(cleanedString, jsonStartIndex);
  if (jsonEndIndex === -1) {
      // If strict balancing fails, try simpler "last bracket" approach as fallback for simple cases
      const lastCloseBracket = cleanedString.lastIndexOf(cleanedString[jsonStartIndex] === '{' ? '}' : ']');
      if (lastCloseBracket > jsonStartIndex) {
          cleanedString = cleanedString.substring(jsonStartIndex, lastCloseBracket + 1);
      } else {
          console.error("Robust JSON parsing failed: Unbalanced brackets in the string.", { snippet: jsonString.substring(0, 200) });
          if (defaultValue !== undefined) return defaultValue;
          throw new Error("Unbalanced brackets in the string.");
      }
  } else {
      cleanedString = cleanedString.substring(jsonStartIndex, jsonEndIndex + 1);
  }

  // 4. Remove trailing commas from objects and arrays which is a common AI mistake
  // This regex matches a comma, followed by whitespace, followed by } or ]
  cleanedString = cleanedString.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleanedString) as T;
  } catch (error) {
    // If first parse fails, try removing comments (// and /* */)
    try {
        // This regex captures strings in group 1/2/3 to preserve them, and comments in group 4 to remove them.
        // It handles: "http://example.com" (preserves //), // comment (removes), /* comment */ (removes)
        const noComments = cleanedString.replace(/("([^"\\]*(\\.[^"\\]*)*)")|(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, (match, str) => {
            // If it matched a string (str is defined), keep it. If it matched a comment (str is undefined), remove it.
            return str !== undefined ? match : "";
        });
        // Re-clean trailing commas as comment removal might have exposed them
        const noCommentsNoCommas = noComments.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(noCommentsNoCommas) as T;
    } catch (retryError) {
        // If both fail, log and throw
        const errMessage = error instanceof Error ? error.message : String(error);
        console.error("Robust JSON parsing failed.", {
          originalSnippet: jsonString.substring(0, 200),
          cleanedString: cleanedString,
          error: errMessage
        });
        
        if (defaultValue !== undefined) {
          return defaultValue;
        }
        
        throw new Error(`JSON Parse Error: ${errMessage}. The AI returned malformed JSON.`);
    }
  }
}