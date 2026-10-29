# Opal UV apply and safe cleanup fix v1.0.31

Removes the non-yieldable pcall wrapper around OpenResty internal subrequests. This fixes the observed LuaJIT error “attempt to yield across metamethod/C-call boundary”. A single bounded pulse and OFF cleanup are unchanged. Exact v1.0.30 rollback included.
