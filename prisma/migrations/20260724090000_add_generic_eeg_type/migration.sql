-- Add a generic "EEG" value: CHUA does not classify exams by sub-type
-- (Standard/Sommeil/Ambulatoire/Video-EEG). New demandes use this value;
-- historical rows keep their original typeEEG unchanged.
ALTER TYPE "TypeEEG" ADD VALUE 'EEG';
