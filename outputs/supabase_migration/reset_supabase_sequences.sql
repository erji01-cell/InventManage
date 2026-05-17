select setval(pg_get_serial_sequence('invent_suppliers', 'id'), coalesce((select max(id) from invent_suppliers), 1), true);
select setval(pg_get_serial_sequence('invent_staff', 'id'), coalesce((select max(id) from invent_staff), 1), true);
select setval(pg_get_serial_sequence('invent_child_assets', 'id'), coalesce((select max(id) from invent_child_assets), 1), true);
select setval(pg_get_serial_sequence('invent_stock_movements', 'id'), coalesce((select max(id) from invent_stock_movements), 1), true);
