import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const Loading: React.FC<LoadingProps> = ({
    message = 'Loading...',
    size = 'md'
}) => {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8'
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
            <div className="flex flex-col items-center space-y-4">
                <Loader2 className={`${sizeClasses[size]} animate-spin text-primary-600`} />
                {message && (
                    <p className="text-sm text-gray-600 animate-pulse">{message}</p>
                )}
            </div>
        </div>
    );
};

export default Loading;