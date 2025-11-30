(function_item
  name: (identifier) @name) @kind.function

(impl_item
  (declaration_list
    (function_item
      name: (identifier) @name) @kind.method))

(struct_item
  name: (type_identifier) @name) @kind.struct

(enum_item
  name: (type_identifier) @name) @kind.enum

(union_item
  name: (type_identifier) @name) @kind.union

(trait_item
  name: (type_identifier) @name) @kind.trait

(type_item
  name: (type_identifier) @name) @kind.type

(const_item
  name: (identifier) @name) @kind.const

(static_item
  name: (identifier) @name) @kind.static

(mod_item
  name: (identifier) @name) @kind.module
