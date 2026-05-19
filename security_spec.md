# Security Specification - Barbearia D'Biazzi

## Data Invariants
- **Appointment Integrity**: Every appointment document must contain `name`, `phone`, `service`, `date`, `time`, `status`, and `createdAt`.
- **Status Transitions**: Status must start as `pending`.
- **Admin Authorization**: Only UIDs present in the `/admins/` collection can read appointment data.
- **Timestamp Accuracy**: `createdAt` must match `request.time`.

## The "Dirty Dozen" Payloads (Denial Tests)

1. **Anonymous Write to Admins**: Create a document in `/admins/` as an unauthenticated user.
2. **Unauthorized Appointment Read**: Attempt to read all documents in `/appointments/` without being an admin.
3. **Appointment Status Hijack**: Update an appointment status as a guest user.
4. **Spoofed Creation Date**: Create an appointment with a `createdAt` in the past.
5. **Admin Escape**: Update an admin document to add a new admin field as a non-admin.
6. **Large Payload Attack**: Create an appointment with a 1MB string in the `name` field.
7. **Malformed Phone**: Create an appointment with a phone number that is an object instead of a string.
8. **Invalid Status**: Create an appointment with `status: "fake"`.
9. **UID Spoofing**: Try to delete an appointment by providing a random ID.
10. **System Field Injection**: Attempt to create an appointment with an extra field `isSpecial: true`.
11. **Admin Lookup Bypass**: Read `/appointments/` by guessing a specific ID as a guest.
12. **Double Status Update**: Update a `cancelled` appointment back to `pending`.

## Test Runner
A `firestore.rules.test.ts` file will be implemented to verify these constraints.
