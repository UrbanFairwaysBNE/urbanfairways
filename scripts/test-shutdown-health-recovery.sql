-- Read-only regression: same bay/booking within the shutdown window only.
WITH fixtures(wbay,cbay,wbooking,cbooking,seconds,expected) AS (
 VALUES (2,2,'a','a',-0.002,true), (2,2,'a','a',10,true),
 (2,3,'a','a',10,false), (2,2,'a','b',10,false),
 (2,2,'a','a',31,false), (2,2,'a','a',-3,false)
)
SELECT bool_and((wbay=cbay AND wbooking=cbooking AND seconds BETWEEN -2 AND 30)=expected)
 AS all_matching_cases_pass FROM fixtures;