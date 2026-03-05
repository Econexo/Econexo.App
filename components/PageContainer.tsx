import React from 'react';

interface PageContainerProps {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}

/**
 * Responsive page container that constrains width per breakpoint:
 * - Mobile  (default): max-w-md  (448px)
 * - Tablet  (md):      max-w-2xl (672px)
 * - Desktop (xl):      max-w-5xl (1024px) — used inside the sidebar layout
 */
const PageContainer: React.FC<PageContainerProps> = ({ children, className = '', noPadding = false }) => {
    return (
        <div
            className={`
        w-full mx-auto
        max-w-md md:max-w-2xl xl:max-w-5xl
        ${noPadding ? '' : 'px-0'}
        ${className}
      `}
        >
            {children}
        </div>
    );
};

export default PageContainer;
