import { z } from 'zod';

/**
 * A custom Zod pre-processor for optional string fields.
 * It transforms empty strings "" and null values into `undefined`,
 * ensuring they are omitted from the final JSON payload during serialization.
 * This is the primary fix for the `phone_number: ""` validation error.
 */
const optionalString = z.preprocess(
  (val) => (val === "" || val === null ? undefined : val),
  z.string().optional()
);

/**
 * Authoritative Zod schema for a SINGLE ClickSend v3 Contact payload.
 * The endpoint POST /v3/lists/{list_id}/contacts only accepts one contact at a time.
 * This schema enforces the API's business logic that a contact must have at least one key identifier.
 */
export const AddContactApiSchema = z.object({
  first_name: optionalString,
  last_name: optionalString,
  email: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.string().email({ message: "Invalid email format" }).optional()
  ),
  phone_number: optionalString,
  fax_number: optionalString,
  address_line_1: optionalString,
  address_line_2: optionalString,
  address_city: optionalString,
  address_state: optionalString,
  address_postal_code: optionalString,
  address_country: optionalString,
  organization_name: optionalString,
  custom_1: optionalString,
  custom_2: optionalString,
  custom_3: optionalString,
  custom_4: optionalString,
})
.refine(
  (data) => 
    data.email || 
    data.phone_number || 
    data.fax_number || 
    data.address_line_1,
  {
    message: "A contact must have at least one of: email, phone_number, fax_number, or address_line_1."
  }
);

// Infer the TypeScript type for use in services
export type AddContactPayload = z.infer<typeof AddContactApiSchema>;


/**
 * Zod schema for ClickSend SMS Campaign payloads, based on the data contract
 * from the root cause analysis document.
 * This enforces type correctness and presence of required fields before an API call is made.
 */
export const SmsCampaignSchema = z.object({
  list_id: z.number({ required_error: 'List ID is required', invalid_type_error: 'List ID must be a number' }).int().positive('List ID must be a positive integer'),
  name: z.string({ required_error: 'Campaign name is required' }).min(1, 'Campaign name cannot be empty'),
  body: z.string({ required_error: 'Message body is required' }).min(1, 'Message body cannot be empty'),
  from: z.string().optional(),
  schedule: z.number().int().positive().optional(),
});

/**
 * Schema for POST /v3/email/templates.
 * Used in the first step of the two-step email campaign sending process.
 * FIX: Added `template_id_master` as a required field.
 */
export const createTemplateApiSchema = z.object({
  template_name: z.string().min(1),
  template_html: z.string().min(1),
  template_id_master: z.number().int().positive()
});

/**
 * Zod schema for the correct ClickSend Email Campaign endpoint (`email-campaigns/send`).
 * This ensures the payload includes a template ID for proper campaign sending and personalization,
 * and that all required fields for this specific endpoint are present.
 */
export const EmailCampaignApiSchema = z.object({
    list_id: z.number({ required_error: "List ID is required for campaign sending." }).int().positive(),
    template_id: z.number({ required_error: "A template ID is required for campaign sending." }).int().positive(),
    name: z.string({ required_error: "Campaign Name is required." }).min(1),
    subject: z.string({ required_error: "Subject is required." }).min(1),
    from_email_address_id: z.number({ required_error: "From Email ID is required. Please configure it in the Admin Panel." }).int().positive(),
    from_name: z.string({ required_error: "From Name is required." }).min(1),
    schedule: z.number().int().positive().optional(),
});