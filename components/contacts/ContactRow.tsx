import React, { FC } from 'react';
import type { Customer } from '@/types';
import { useAppStore } from '@/store/store';

interface ContactRowProps {
    customer: Customer;
    isSelected: boolean;
    isVerifying: boolean;
    isDeleting: boolean;
    keyAccountCount?: number;
    onToggleSelection: (id: string) => void;
    onEdit: (customer: Customer) => void;
    onVerify: (id: string) => void;
    onDelete: (id: string) => void;
    onShowKeyAccount: (companyName: string) => void;
}

const ContactRowComponent: FC<ContactRowProps> = ({
    customer,
    isSelected,
    isVerifying,
    isDeleting,
    keyAccountCount,
    onToggleSelection,
    onEdit,
    onVerify,
    onDelete,
    onShowKeyAccount,
}) => {
    const statusColors: { [key: string]: string } = { Verified: 'bg-profit-bg text-profit-color', Unverified: 'bg-yellow-500/20 text-yellow-500', Contradictory: 'bg-orange-500/20 text-orange-500', 'Invalid Format': 'bg-red-500/20 text-red-500', Inactive: 'bg-loss-bg text-loss-color' };
    const activityStatusColors: { [key: string]: string } = { 'Active': 'bg-profit-bg text-profit-color', 'Dissolved': 'bg-loss-bg text-loss-color', 'In Liquidation': 'bg-orange-500/20 text-orange-500', 'Unknown': 'bg-surface text-text-secondary' };

    return (
        <tr>
            <td><input type="checkbox" checked={isSelected} onChange={() => onToggleSelection(customer.id)}/></td>
            <td>{customer.contactName}</td>
            <td>
                <div className="flex items-center gap-2">
                    <span>{customer.company}</span>
                    {keyAccountCount && keyAccountCount > 1 && (
                        <button 
                            className="text-primary font-bold text-xs bg-primary/10 px-2 py-1 rounded-full hover:bg-primary/20" 
                            title={`Key account, associated with ${keyAccountCount} leads.`} 
                            onClick={() => customer.company && onShowKeyAccount(customer.company)}
                        >
                            ★ {keyAccountCount}
                        </button>
                    )}
                </div>
            </td>
            <td>{customer.type}</td>
            <td>{typeof customer.address === 'string' ? customer.address : JSON.stringify(customer.address)}</td>
            <td>{customer.email}</td>
            <td>{customer.phone}</td>
            <td>{customer.mobile}</td>
            <td><span className={`px-2 py-1 text-xs font-bold rounded-full ${activityStatusColors[customer.activityStatus || 'Unknown'] || 'bg-surface text-text-secondary'}`}>{customer.activityStatus || 'N/A'}</span></td>
            <td title={customer.companySizeReasoning}>{customer.companySize || 'N/A'}{customer.companySizeReasoning && <span className="ml-1 text-primary cursor-help">ⓘ</span>}</td>
            <td>
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusColors[customer.status] || 'bg-surface text-text-secondary'}`}>{customer.status}</span>
                    {customer.sourceOrigin === 'Data Miner' && <span title="Sourced from Data Miner" className="px-2 py-1 text-xs font-bold rounded-full bg-blue-500/20 text-blue-400">DM</span>}
                </div>
            </td>
            <td>
                <div className="flex gap-2">
                    <button className="btn sm" onClick={() => onEdit(customer)}>Edit</button>
                    {!['Verified', 'Inactive'].includes(customer.status) && (
                        <button className="btn green sm" onClick={() => onVerify(customer.id)} disabled={isVerifying} title="Use AI to re-verify this contact">
                            {isVerifying ? <span className="loader" /> : 'Verify'}
                        </button>
                    )}
                    <button className="btn red sm" onClick={() => onDelete(customer.id)} disabled={isDeleting}>
                        {isDeleting ? <span className="loader" /> : 'Del'}
                    </button>
                </div>
            </td>
        </tr>
    );
};

export const ContactRow = React.memo(ContactRowComponent);