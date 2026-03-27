import { useAppStore } from '../../store/store';
import { IEmailService } from './IEmailService';
import { ClickSendEmailService } from './ClickSendEmailService';
import { MailRelayEmailService } from './SendGridEmailService';

export function getEmailProvider(): IEmailService | null {
    const { emailProvider, clicksendConfig, mailRelayHostname, mailRelayApiKey } = useAppStore.getState();

    if (emailProvider === 'mailrelay' && mailRelayHostname && mailRelayApiKey) {
        return new MailRelayEmailService(mailRelayHostname, mailRelayApiKey);
    }
    
    // Default to ClickSend for email if it's selected or if no provider is set but its config exists
    if (emailProvider === 'clicksend' && clicksendConfig) {
        return new ClickSendEmailService(clicksendConfig);
    }
    
    // Fallback for backward compatibility if no provider is explicitly set
    if (!emailProvider && clicksendConfig) {
        return new ClickSendEmailService(clicksendConfig);
    }

    return null;
}
