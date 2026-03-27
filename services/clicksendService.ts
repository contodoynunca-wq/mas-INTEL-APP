import type { ClickSendConfig, ClickSendBalance, CampaignContact } from '@/types';
import { useAppStore } from '@/store/store';
import { z, ZodError } from 'zod';
import { AddContactApiSchema, SmsCampaignSchema, EmailCampaignApiSchema, createTemplateApiSchema } from '../schemas/clicksend.schemas';

const CLICK_SEND_API_BASE = '/api-proxy/clicksend/v3';

const createAuthHeader = (config: ClickSendConfig): string => {
    return 'Basic ' + btoa(`${config.username}:${config.apiKey}`);
};

const clickSendFetch = async (url: string, options: RequestInit): Promise<any> => {
    const { logEvent } = useAppStore.getState();
    let response: Response;

    const maxRetries = 3;
    const initialDelay = 1500;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            response = await fetch(url, options);
            if (response.status >= 500 || response.status === 429) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            break; 
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
                logEvent('SYS', `ClickSend request failed. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                const errString = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
                logEvent('ERR', `ClickSend request failed after all retries: ${errString}`);
                throw lastError;
            }
        }
    }
    // @ts-ignore
    if (!response) {
      throw new Error("ClickSend request failed after all retries.");
    }

    if (!response.ok) {
        let errorBody = 'Could not read error body.';
        let errorData: any = {};
        try {
            errorBody = await response.text();
            // FIX: Only attempt to parse the error body as JSON if it looks like a JSON object or array.
            // This prevents the "Could not parse... 404 File not found" error.
            if (errorBody && (errorBody.trim().startsWith('{') || errorBody.trim().startsWith('['))) {
                errorData = JSON.parse(errorBody);
            }
        } catch (e) {
            console.error("Could not parse potential ClickSend JSON error response. Raw body:", errorBody);
        }
        
        let parsedPayload = null;
        try {
            parsedPayload = options.body ? JSON.parse(options.body as string) : null;
        } catch (e) {
            parsedPayload = "Unparsable Body";
        }

        const logObject = {
            endpoint: url,
            requestPayload: parsedPayload,
            status: response.status,
            apiResponseCode: errorData?.response_code,
            apiResponseMessage: errorData?.response_msg || errorBody, // Fallback to raw body
            apiResponseData: errorData?.data,
        };
        logEvent('ERR', `ClickSend API Error: ${JSON.stringify(logObject)}`);

        // Provide a more useful error message by using the raw text if JSON parsing fails.
        const specificMessage = errorData?.response_msg || (errorBody.length < 100 ? errorBody : `Received status ${response.status}`);
        throw new Error(`ClickSend API Error: ${specificMessage}`);
    }
    
    if (response.status === 204) {
        return null;
    }

    const data = await response.json();
    if (data.http_code && data.http_code !== 200) {
        throw new Error(`ClickSend API Error: ${data.response_msg || 'An internal API error occurred.'}`);
    }

    return data.data || data;
};

export const getAccountBalance = async (config: ClickSendConfig): Promise<ClickSendBalance> => {
    const data = await clickSendFetch(`${CLICK_SEND_API_BASE}/account`, {
        method: 'GET',
        headers: {
            'Authorization': createAuthHeader(config),
            'Content-Type': 'application/json'
        }
    });
    
    const balanceValue = parseFloat(data.balance);

    return {
        balance: isNaN(balanceValue) ? 0 : balanceValue,
        currency: data.country,
    };
};

export const createContactList = async (config: ClickSendConfig, listName: string): Promise<number> => {
    const data = await clickSendFetch(`${CLICK_SEND_API_BASE}/lists`, {
        method: 'POST',
        headers: {
            'Authorization': createAuthHeader(config),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ list_name: listName })
    });
    return data.list_id;
};

export const addContactsToList = async (config: ClickSendConfig, listId: number, contacts: CampaignContact[]): Promise<void> => {
    const { logEvent } = useAppStore.getState();

    const formatPhoneNumber = (phone: string) => {
        if (!phone) return '';
        let digits = phone.replace(/\D/g, '');
        if (digits.startsWith('0')) {
            digits = '44' + digits.substring(1); // Assuming UK numbers
        }
        return `+${digits}`;
    };

    const errors: { contact: string; error: string }[] = [];
    const successes: any[] = [];

    for (const contact of contacts) {
        try {
            const nameParts = contact.contactName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ');

            const payloadToValidate = {
                first_name: firstName,
                last_name: lastName,
                phone_number: formatPhoneNumber(contact.phone),
                email: contact.email,
                organisation_name: contact.company,
            };

            const validationResult = AddContactApiSchema.safeParse(payloadToValidate);
            if (!validationResult.success) {
                throw new ZodError(validationResult.error.issues);
            }
            
            const payloadToSend = validationResult.data;

            const response = await clickSendFetch(`${CLICK_SEND_API_BASE}/lists/${listId}/contacts`, {
                method: 'POST',
                headers: {
                    'Authorization': createAuthHeader(config),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadToSend)
            });
            successes.push({ contact: contact.email || contact.phone, response });

        } catch (error) {
            // IMPROVED: Correctly stringify objects for logging to avoid [object Object]
            const errorMessage = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));
            const contactIdentifier = contact.email || contact.phone || 'Unknown Contact';
            errors.push({ contact: contactIdentifier, error: errorMessage });
            logEvent('ERR', `Failed to add contact ${contactIdentifier} to list ${listId}. Error: ${errorMessage}`);
        }
    }

    if (errors.length > 0) {
        logEvent('ERR', `Partially failed to add contacts to list ${listId}. ${errors.length} of ${contacts.length} failed.`);
        if (successes.length === 0 && contacts.length > 0) {
            throw new Error(`Failed to add any contacts to list ${listId}. Please check the system logs for details on each failure.`);
        }
    }
    
    if (successes.length > 0) {
        logEvent('SYS', `Successfully added ${successes.length} of ${contacts.length} contacts to list ${listId}.`);
    }
};

export const sendSmsCampaign = async (config: ClickSendConfig, listId: number, campaignName: string, message: string): Promise<any> => {
    const payload = {
        list_id: listId,
        name: campaignName,
        body: message,
        from: config.fromSms || "MontAzul",
    };

    try {
        SmsCampaignSchema.parse(payload);
    } catch (error) {
        if (error instanceof ZodError) {
            const formattedError = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            throw new Error(`Local SMS campaign data is invalid: ${formattedError}`);
        }
        throw error;
    }

    return await clickSendFetch(`${CLICK_SEND_API_BASE}/sms-campaigns/send`, {
        method: 'POST',
        headers: {
            'Authorization': createAuthHeader(config),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
};

export const sendEmailCampaign = async (config: ClickSendConfig, listId: number, campaignName: string, subject: string, body: string): Promise<any> => {
    const { logEvent } = useAppStore.getState();
    let newTemplateId: number | null = null;
    
    const masterTemplateId = config.masterTemplateId;
    if (!masterTemplateId) {
      logEvent('ERR', 'CLICKSEND_MASTER_TEMPLATE_ID is not set in the ClickSend configuration.');
      throw new Error('A Master Template ID has not been selected. Please configure it in the Admin Panel.');
    }

    try {
        const templateName = `${campaignName} Template ${Date.now()}`;
        const templatePayload = {
            template_name: templateName,
            template_html: body,
            template_id_master: masterTemplateId
        };

        try {
            createTemplateApiSchema.parse(templatePayload);
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedError = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                throw new Error(`Local template data is invalid: ${formattedError}`);
            }
            throw error;
        }

        logEvent('SYS', `Creating new email template: ${templateName} using master ${masterTemplateId}`);
        const templateResponse = await clickSendFetch(`${CLICK_SEND_API_BASE}/email/templates`, {
            method: 'POST',
            headers: { 'Authorization': createAuthHeader(config), 'Content-Type': 'application/json' },
            body: JSON.stringify(templatePayload)
        });
        
        newTemplateId = templateResponse?.template_id;
        if (!newTemplateId) {
            logEvent('ERR', `Failed to parse new template_id from create template response. Response: ${JSON.stringify(templateResponse)}`);
            throw new Error('Could not create email template.');
        }
        logEvent('SYS', `Successfully created template_id: ${newTemplateId}`);

        const campaignPayload = {
            list_id: listId,
            template_id: newTemplateId,
            name: campaignName,
            subject: subject,
            from_email_address_id: config.fromEmailId!,
            from_name: config.fromName,
        };
        
        try {
            EmailCampaignApiSchema.parse(campaignPayload);
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedError = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                throw new Error(`Local email campaign data is invalid: ${formattedError}`);
            }
            throw error;
        }

        logEvent('SYS', `Sending email campaign ${campaignName} to list ${listId} using template ${newTemplateId}`);
        const campaignResponse = await clickSendFetch(`${CLICK_SEND_API_BASE}/email-campaigns/send`, {
            method: 'POST',
            headers: { 'Authorization': createAuthHeader(config), 'Content-Type': 'application/json' },
            body: JSON.stringify(campaignPayload)
        });

        logEvent('SYS', 'Email campaign sent successfully.');
        return campaignResponse;

    } finally {
        if (newTemplateId) {
            try {
                logEvent('SYS', `Attempting to delete temporary template ${newTemplateId}`);
                await clickSendFetch(`${CLICK_SEND_API_BASE}/email/templates/${newTemplateId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': createAuthHeader(config) },
                });
                logEvent('SYS', `Successfully deleted temporary template ${newTemplateId}`);
            } catch (deleteError) {
                const errorMessage = deleteError instanceof Error ? deleteError.message : String(deleteError);
                logEvent('ERR', `Failed to delete temporary template ${newTemplateId}. This is not a critical error. Error: ${errorMessage}`);
            }
        }
    }
};

export const getContactLists = async (config: ClickSendConfig) => {
    const data = await clickSendFetch(`${CLICK_SEND_API_BASE}/lists`, {
        method: 'GET',
        headers: {
            'Authorization': createAuthHeader(config),
            'Content-Type': 'application/json'
        },
    });
    return data.data; 
};

export const getContactsFromList = async (config: ClickSendConfig, listId: number) => {
    const data = await clickSendFetch(`${CLICK_SEND_API_BASE}/lists/${listId}/contacts?limit=1000`, {
        method: 'GET',
        headers: {
            'Authorization': createAuthHeader(config),
            'Content-Type': 'application/json'
        },
    });
    return data.data;
};

export const deleteContactList = async (config: ClickSendConfig, listId: number) => {
    await clickSendFetch(`${CLICK_SEND_API_BASE}/lists/${listId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': createAuthHeader(config),
            'Content-Type': 'application/json'
        },
    });
};

export const fetchEmailCampaignStats = async (config: ClickSendConfig, campaignId: number) => {
    return await clickSendFetch(`${CLICK_SEND_API_BASE}/email-campaigns/${campaignId}`, {
        method: 'GET',
        headers: { 'Authorization': createAuthHeader(config) }
    });
};

export const fetchSmsCampaignStats = async (config: ClickSendConfig, campaignId: number) => {
    return await clickSendFetch(`${CLICK_SEND_API_BASE}/sms-campaigns/${campaignId}`, {
        method: 'GET',
        headers: { 'Authorization': createAuthHeader(config) }
    });
};

export const fetchInboundSms = async (config: ClickSendConfig) => {
    const data = await clickSendFetch(`${CLICK_SEND_API_BASE}/sms/inbound`, {
        method: 'GET',
        headers: { 'Authorization': createAuthHeader(config) }
    });
    return data.data;
};

export const getMasterTemplates = async (config: ClickSendConfig): Promise<any[]> => {
    const { logEvent } = useAppStore.getState();
    logEvent('SYS', 'Fetching ClickSend master template categories...');

    const categoryResponse = await clickSendFetch(`${CLICK_SEND_API_BASE}/email/master-templates-categories`, {
        method: 'GET',
        headers: { 'Authorization': createAuthHeader(config), 'Content-Type': 'application/json' },
    });

    const categories = categoryResponse?.data;
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
        logEvent('ERR', 'No ClickSend master template categories found.');
        return [];
    }

    const firstCategory = categories[0];
    const categoryId = firstCategory.category_id;
    logEvent('SYS', `Found category "${firstCategory.category_name}". Fetching templates from it...`);

    const templatesResponse = await clickSendFetch(`${CLICK_SEND_API_BASE}/email/master-templates-categories/${categoryId}/master-templates`, {
        method: 'GET',
        headers: { 'Authorization': createAuthHeader(config), 'Content-Type': 'application/json' },
    });

    const masterTemplates = templatesResponse?.data;
    if (!masterTemplates || !Array.isArray(masterTemplates)) {
        logEvent('ERR', `No master templates found in category ${categoryId}.`);
        return [];
    }

    logEvent('SYS', `Successfully fetched ${masterTemplates.length} master templates.`);
    return masterTemplates;
};