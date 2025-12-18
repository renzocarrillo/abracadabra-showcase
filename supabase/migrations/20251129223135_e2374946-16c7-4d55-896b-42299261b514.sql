-- Create the missing pedidos_sequence
CREATE SEQUENCE IF NOT EXISTS pedidos_sequence
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;