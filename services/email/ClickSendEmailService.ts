import { IEmailService } from './IEmailService';
import type { Campaign, ClickSendConfig } from '@/types';
import { createContactList, addContactsToList, sendEmailCampaign } from '@/services/clicksendService';
import { getDb } from '@/services/firebase';
import { useAppStore } from '@/store/store';

export class ClickSendEmailService implements IEmailService {
    private config: ClickSendConfig;

    constructor(config: ClickSendConfig) {
        this.config = config;
    }

    async sendCampaign(campaign: Campaign): Promise<{ success: boolean; campaignId?: string | number }> {
        const { logEvent } = useAppStore.getState();

        if (!this.config.fromEmailId || !this.config.fromName) {
            throw new Error("ClickSend 'From Email ID' and 'From Name' must be set in the Admin panel.");
        }
        
        const template = campaign.emailTemplates?.[0];
        if (!template) throw new Error("No email template found for this campaign.");

        const contactsForSync = campaign.contacts || [];
        if (contactsForSync.length === 0) throw new Error("This campaign has no contacts to send to.");

        const db = getDb();
        let listId = campaign.clicksendListId;
        if (!listId) {
            logEvent('SYS', 'Creating new ClickSend contact list...');
            listId = await createContactList(this.config, `${campaign.name} List`);
            await db.collection('campaigns').doc(campaign.id).update({ clicksendListId: listId });
        }
        
        logEvent('SYS', `Syncing ${contactsForSync.length} contacts to ClickSend list ${listId}...`);
        await addContactsToList(this.config, listId, contactsForSync);

        logEvent('SYS', 'Sending email campaign via ClickSend...');
        const finalBody = template.body.replace(/{{name}}/g, '[first_name]');
        const finalSubject = template.subject.replace(/{{name}}/g, '[first_name]');
        const response = await sendEmailCampaign(this.config, listId, campaign.name, finalSubject, finalBody);
        
        const campaignId = response?.data?.campaign_id;
        
        return { success: true, campaignId: campaignId };
    }
}