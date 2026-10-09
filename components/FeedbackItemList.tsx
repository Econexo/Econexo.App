import React from 'react';
import { FeedbackItem, FeedbackItemType, ITEM_TYPE_META, PRIORITY_LABEL, sortItems } from '../utils/feedback';

const TYPE_STYLE: Record<FeedbackItemType, { icon: string; chip: string }> = {
    hallazgo:   { icon: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',  chip: 'text-amber-700' },
    sugerencia: { icon: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30',        chip: 'text-sky-700' },
    logro:      { icon: 'text-primary bg-green-50 dark:bg-green-900/30',    chip: 'text-green-700' },
};

const PRIORITY_STYLE = {
    alta:  'bg-red-50 text-red-600 border-red-100',
    media: 'bg-amber-50 text-amber-700 border-amber-100',
    baja:  'bg-gray-50 text-gray-500 border-gray-200',
};

const FeedbackItemList: React.FC<{ items: FeedbackItem[]; dark?: boolean }> = ({ items, dark }) => {
    const sorted = sortItems(items);
    const groups = (['hallazgo', 'sugerencia', 'logro'] as FeedbackItemType[])
        .map(type => ({ type, items: sorted.filter(i => i.type === type) }))
        .filter(g => g.items.length > 0);

    const title = dark ? 'text-gray-900 dark:text-white' : 'text-gray-900';
    const body = dark ? 'text-gray-600 dark:text-gray-300' : 'text-gray-600';
    const card = dark ? 'bg-white/70 dark:bg-slate-800/60 border-white/80 dark:border-white/10' : 'bg-white border-gray-100';

    return (
        <div className="space-y-5">
            {groups.map(group => (
                <div key={group.type}>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${TYPE_STYLE[group.type].chip}`}>
                        {ITEM_TYPE_META[group.type].plural} · {group.items.length}
                    </h4>
                    <ul className="space-y-2">
                        {group.items.map(item => (
                            <li key={item.id} className={`flex gap-3 p-3 rounded-2xl border ${card}`}>
                                <div className={`size-9 shrink-0 rounded-xl flex items-center justify-center ${TYPE_STYLE[item.type].icon}`}>
                                    <span className="material-symbols-outlined text-lg">{ITEM_TYPE_META[item.type].icon}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className={`text-sm font-black leading-snug ${title}`}>{item.title}</p>
                                        {item.type === 'hallazgo' && (
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[item.priority ?? 'media']}`}>
                                                {PRIORITY_LABEL[item.priority ?? 'media']}
                                            </span>
                                        )}
                                    </div>
                                    {item.detail.trim() && (
                                        <p className={`text-xs mt-1 leading-relaxed whitespace-pre-line ${body}`}>{item.detail}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

export default FeedbackItemList;
