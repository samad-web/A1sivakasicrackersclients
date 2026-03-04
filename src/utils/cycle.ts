
export interface CycleRange {
    startYear: number;
    months: { val: string; label: string }[];
    isArchived: boolean;
}

/**
 * Determines the starting year of the active cycle based on a given date.
 * Cycles start in November.
 */
export const getCurrentCycleYear = (date: Date = new Date()): number => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed (0 = Jan, 10 = Nov)

    // If it's November or December, the cycle started this year.
    // Otherwise, the cycle started the previous year's November.
    return month >= 10 ? year : year - 1;
};

/**
 * Returns the range of months for a given cycle year.
 * A cycle starts in November of the startYear and ends in September of the following year.
 */
export const getCycleRange = (startYear: number) => {
    const months = [];

    // November and December of the startYear
    for (let m = 10; m <= 11; m++) {
        const d = new Date(startYear, m, 1);
        months.push({
            val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('default', { month: 'long', year: 'numeric' })
        });
    }

    // January through September of the following year
    for (let m = 0; m <= 8; m++) {
        const d = new Date(startYear + 1, m, 1);
        months.push({
            val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('default', { month: 'long', year: 'numeric' })
        });
    }

    return months;
};

/**
 * Checks if a cycle is archived (completed).
 * A cycle is archived if the current date is past September of the cycle's following year.
 */
export const isCycleArchived = (startYear: number, currentDate: Date = new Date()): boolean => {
    const activeYear = getCurrentCycleYear(currentDate);
    return startYear < activeYear;
};

/**
 * Generates a list of cycles to show in the selector.
 * Shows the current active cycle and the last 5 archived cycles.
 */
export const getAvailableCycles = (currentDate: Date = new Date()) => {
    const currentStartYear = getCurrentCycleYear(currentDate);
    const cycles = [];

    // Only return the current active cycle
    cycles.push({
        startYear: currentStartYear,
        label: `Cycle ${currentStartYear}-${(currentStartYear + 1).toString().slice(-2)}`,
        isArchived: false
    });

    return cycles;
};
