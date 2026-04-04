import React from 'react';
import {
    Pagination as PaginationRoot,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious
} from '../pagination';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
}) => {
    if (totalPages <= 1) return null;

    // Generate page numbers to show
    const generatePageNumbers = () => {
        const maxPagesToShow = 5;
        const pages: number[] = [];

        // Always show first page
        pages.push(1);

        // Calculate range around current page
        const rangeStart = Math.max(2, currentPage - 1);
        const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

        // Add ellipsis after first page if needed
        if (rangeStart > 2) {
            pages.push(-1); // -1 is a marker for ellipsis
        }

        // Add pages in the calculated range
        for (let i = rangeStart; i <= rangeEnd; i++) {
            pages.push(i);
        }

        // Add ellipsis before last page if needed
        if (rangeEnd < totalPages - 1) {
            pages.push(-2); // -2 is another marker for ellipsis
        }

        // Always add last page if there is more than one page
        if (totalPages > 1) {
            pages.push(totalPages);
        }

        return pages;
    };

    const pageNumbers = generatePageNumbers();

    return (
        <PaginationRoot>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            if (currentPage > 1) onPageChange(currentPage - 1);
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""} size={undefined} />
                </PaginationItem>

                {pageNumbers.map((pageNumber, i) => (
                    pageNumber < 0 ? (
                        // Render ellipsis
                        <PaginationItem key={`ellipsis-${i}`}>
                            <span className="px-4 py-2">...</span>
                        </PaginationItem>
                    ) : (
                        // Render page number
                        <PaginationItem key={pageNumber}>
                            <PaginationLink
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPageChange(pageNumber);
                                }}
                                isActive={currentPage === pageNumber} size={undefined}                            >
                                {pageNumber}
                            </PaginationLink>
                        </PaginationItem>
                    )
                ))}

                <PaginationItem>
                    <PaginationNext
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            if (currentPage < totalPages) onPageChange(currentPage + 1);
                        }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""} size={undefined} />
                </PaginationItem>
            </PaginationContent>
        </PaginationRoot>
    );
};

export default Pagination;