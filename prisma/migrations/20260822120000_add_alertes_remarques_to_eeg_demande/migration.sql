-- Alertes et remarques libres du prescripteur, jusqu'ici reçues de
-- prescription_back mais jamais conservées côté eeg_back.
ALTER TABLE "eeg_demande" ADD COLUMN "alertes" TEXT;
ALTER TABLE "eeg_demande" ADD COLUMN "remarques" TEXT;
