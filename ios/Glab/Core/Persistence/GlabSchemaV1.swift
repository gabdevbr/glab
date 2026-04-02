import SwiftData

/// Versioned schema for SwiftData migration support.
/// When you need to change the model, create GlabSchemaV2 and add a migration plan.
enum GlabSchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)

    static var models: [any PersistentModel.Type] {
        [
            CachedChannel.self,
            CachedMessage.self,
            CachedReaction.self,
            CachedUser.self
        ]
    }
}

/// Migration plan that defines how to migrate between schema versions.
/// Currently only has V1. When V2 is added:
/// 1. Create GlabSchemaV2 with the new models
/// 2. Add a MigrationStage from V1 to V2
/// 3. Update the modelContainer in GlabApp to use this plan
enum GlabMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [GlabSchemaV1.self]
    }

    static var stages: [MigrationStage] {
        // Add migration stages here as schema evolves:
        // .lightweight(fromVersion: GlabSchemaV1.self, toVersion: GlabSchemaV2.self)
        []
    }
}
