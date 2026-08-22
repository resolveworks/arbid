; Classes cover class, interface, and enum declarations.

(class_declaration
  name: (identifier) @name) @definition

(object_declaration
  name: (identifier) @name) @definition

(companion_object
  name: (identifier) @name) @definition

(type_alias
  (identifier) @name) @definition

(enum_entry
  (identifier) @name) @definition

(function_declaration
  name: (identifier) @name) @definition

; Class-body properties are definitions; local bindings in function bodies are not,
; matching the other languages' treatment of variable bindings.

(class_body
  (property_declaration
    (variable_declaration
      (identifier) @name)) @definition)

(enum_class_body
  (property_declaration
    (variable_declaration
      (identifier) @name)) @definition)

; Direct calls include constructor invocations.

(call_expression
  (identifier) @name) @reference.call

; Member calls capture only the final identifier; receivers are not calls.

(call_expression
  (navigation_expression
    (_)
    (identifier) @name)) @reference.call
