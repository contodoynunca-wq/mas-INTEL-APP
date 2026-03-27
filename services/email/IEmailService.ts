import type { Campaign } from '@/types';

export interface IEmailService {
    sendCampaign(campaign: Campaign): Promise<{ success: boolean; campaignId?: string | number }>;
}
