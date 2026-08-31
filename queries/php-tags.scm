; Classes, interfaces, traits, and enums are type definitions; anonymous
; classes have no name and do not match.

(class_declaration
  name: (name) @name) @definition

(interface_declaration
  name: (name) @name) @definition

(trait_declaration
  name: (name) @name) @definition

(enum_declaration
  name: (name) @name) @definition

(enum_case
  name: (name) @name) @definition

; Free functions and methods. Closures and arrow functions are unnamed.

(function_definition
  name: (name) @name) @definition

(method_declaration
  name: (name) @name) @definition

; Class-body properties; constructor-promoted parameters are not properties.

(property_declaration
  (property_element
    (variable_name
      (name) @name))) @definition

; Calls capture the final name segment used at the site: direct, qualified,
; member (including nullsafe), and static calls. Dynamic calls through
; variables or variadic names have no (name) and do not match.

(function_call_expression
  function: (name) @name) @reference.call

(function_call_expression
  function: (qualified_name
    (name) @name)) @reference.call

(member_call_expression
  name: (name) @name) @reference.call

(scoped_call_expression
  name: (name) @name) @reference.call

; Object creation indexes the class name, like new expressions in JavaScript.

(object_creation_expression
  [
    (name) @name
    (qualified_name
      (name) @name)
  ]) @reference.call
