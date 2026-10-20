import React, { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';

export const CustomSearchableDropdown = ({
  triggerText,
  placeholder = "Search...",
  searchValue,
  onSearchChange,
  isOpen,
  setIsOpen,
  widthClass = "w-full",
  children
}) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-10 border border-gray-300 dark:border-gray-700 rounded px-3 text-left text-sm flex justify-between items-center bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 hover:border-gray-400 dark:hover:border-gray-600 transition-colors focus:outline-none"
      >
        <span className="truncate">{triggerText}</span>
        <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
      </button>

      {isOpen && (
        <div 
          className={`custom-dropdown-popover absolute left-0 mt-1 z-[999] rounded-md shadow-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#09090b] text-gray-900 dark:text-gray-100 ${widthClass}`}
        >
          <div className="p-2 sticky top-0 z-[1000] bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-gray-800">
            <Input
              placeholder={placeholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-white dark:bg-[#1a1a1a]"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1 no-scrollbar">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export const CustomDropdownItem = ({ onClick, children }) => {
  return (
    <div
      onClick={onClick}
      className="custom-dropdown-item px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-850 hover:text-gray-900 dark:hover:text-white transition-colors text-gray-700 dark:text-gray-300"
    >
      {children}
    </div>
  );
};

export const CustomDropdown = ({
  trigger,
  isOpen,
  setIsOpen,
  widthClass = "w-56",
  side = "right", // "top", "bottom", "right", "left"
  children
}) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  // Determine positioning classes based on side
  let positionClass = "";
  if (side === "right") {
    positionClass = "absolute left-full ml-2 bottom-0";
  } else if (side === "top") {
    positionClass = "absolute bottom-full mb-2 left-0";
  } else if (side === "bottom") {
    positionClass = "absolute top-full mt-2 left-0";
  } else if (side === "left") {
    positionClass = "absolute right-full mr-2 bottom-0";
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div 
          className={`custom-dropdown-popover absolute z-[999] rounded-md shadow-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#09090b] text-gray-900 dark:text-gray-100 py-1 ${widthClass} ${positionClass} animate-in fade-in-50 zoom-in-95 duration-100`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

