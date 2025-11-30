(function_declaration
  name: (identifier) @name) @kind.function

(method_definition
  name: (property_identifier) @name) @kind.method

(class_declaration
  name: (type_identifier) @name) @kind.class

(interface_declaration
  name: (type_identifier) @name) @kind.interface

(type_alias_declaration
  name: (type_identifier) @name) @kind.type

(enum_declaration
  name: (identifier) @name) @kind.enum

(lexical_declaration
  (variable_declarator
    name: (identifier) @name)) @kind.variable
