-- Ajoute EegNotification.roleCible (nullable) : jusqu'ici aucune
-- notification n'était ciblée par rôle (TECHNICIEN voyait les alertes
-- destinées au CHEF_SERVICE et inversement). NULL = visible par tous,
-- pour ne pas casser les notifications déjà en base.
ALTER TABLE "eeg_notification"
  ADD COLUMN "roleCible" TEXT;
