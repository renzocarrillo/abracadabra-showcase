-- Manually archive V1001 and consume its stock (using correct enum value)
UPDATE ventas 
SET estado = 'archivado',
    url_public_view = 'https://app2.bsale.cl/view/92425/8ab0b73cff81?sfd=99'
WHERE venta_id = 'V1001';

-- Consume stock for V1001 (move from comprometido to consumed)
UPDATE stockxbin 
SET comprometido = GREATEST(0, comprometido - 1),
    en_existencia = GREATEST(0, en_existencia - 1),
    updated_at = now()
WHERE id = 'd08f29fb-652e-48ca-a029-992a4112484b';