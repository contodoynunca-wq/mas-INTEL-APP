
import React, { useState, useEffect, FC } from 'react';

const Clock: FC = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timerId = window.setInterval(() => setTime(new Date()), 1000);
        return () => window.clearInterval(timerId);
    }, []);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-GB');
    };

    return (
        <div className="text-center p-4">
            <div className="text-2xl font-bold text-primary">{formatTime(time)}</div>
            <div className="text-sm text-text-secondary">{formatDate(time)}</div>
        </div>
    );
};

export default Clock;
