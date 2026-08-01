-- Ajoute A_INTERPRETER à l'enum TypeNotification : notifie le CHEF_SERVICE
-- quand un TECHNICIEN termine la réalisation d'un examen (transfert
-- TECHNICIEN -> CHEF_SERVICE), auparavant sans notification interactive
-- (seule l'alerte "non interprété depuis 24h" existait, bien trop tardive).
ALTER TYPE "TypeNotification" ADD VALUE 'A_INTERPRETER';
