import { FileProvider } from './FileProvider.js?v=1.2.4';
import {
  canReadModule,
  canWriteModule,
  getCurrentAccess,
} from '../../cloud/access.js?v=1.2.4';
import { supabase } from '../../cloud/supabaseClient.js?v=1.2.4';

const DEFAULT_BUCKET = 'tpos-resources';

function clean(value = '') {
  return String(value ?? '').trim();
}

function cloneWithoutBlob(resource = {}) {
  const { fileBlob, cloudPending, ...rest } = resource || {};
  return rest;
}

function safeFileName(value = 'file') {
  const name = clean(value) || 'file';

  return name
    .replaceAll('/', '_')
    .replaceAll('\\', '_')
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .slice(0, 180)
    || 'file';
}

function mapRow(row = {}) {
  return {
    id: row.id || '',
    athleteId: row.athlete_id || '',
    moduleId: row.module_key || '',
    kind: row.kind || 'link',
    linkType: row.link_type || '',
    youtubeId: row.youtube_id || '',
    title: row.title || '',
    notes: row.notes || '',
    url: row.url || '',
    fileName: row.file_name || '',
    mimeType: row.mime_type || '',
    size: Number(row.size_bytes || 0),
    storagePath: row.storage_path || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

export class SupabaseFileProvider extends FileProvider {
  constructor({
    bucket = DEFAULT_BUCKET,
    localFallback = null,
  } = {}) {
    super({
      id: 'supabase-storage',
      label: 'Cloud · Supabase Storage',
      capabilities: {
        local: Boolean(localFallback),
        cloud: true,
        offline: false,
      },
    });

    this.bucket = bucket;
    this.localFallback = localFallback;
  }

  athleteId() {
    const athleteId = clean(getCurrentAccess().athleteId);

    if (!athleteId) {
      throw new Error('Atleta cloud non disponibile.');
    }

    return athleteId;
  }

  assertRead(moduleId) {
    if (!canReadModule(moduleId)) {
      throw new Error(`Accesso in lettura non disponibile per ${moduleId}.`);
    }
  }

  assertWrite(moduleId) {
    if (!canWriteModule(moduleId)) {
      throw new Error(`Accesso in scrittura non disponibile per ${moduleId}.`);
    }
  }

  async localResources(moduleId, athleteId = this.athleteId()) {
    if (!this.localFallback) return [];

    try {
      const rows = await this.localFallback.listResources(moduleId);

      return (rows || []).filter(resource =>
        !resource?.athleteId
        || resource.athleteId === athleteId
      );
    } catch (error) {
      console.warn('Resource local fallback unavailable.', error);
      return [];
    }
  }

  async cloudResources(moduleId, athleteId = this.athleteId()) {
    const { data, error } = await supabase
      .from('resource_library_items')
      .select(
        'athlete_id,id,module_key,kind,link_type,youtube_id,title,notes,url,file_name,mime_type,size_bytes,storage_path,created_at,updated_at',
      )
      .eq('athlete_id', athleteId)
      .eq('module_key', moduleId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapRow);
  }

  storagePath(resource, athleteId, moduleId) {
    const fileName = safeFileName(
      resource.fileName || resource.title || 'file',
    );

    return [
      athleteId,
      moduleId,
      clean(resource.id),
      fileName,
    ].join('/');
  }

  async uploadFile(resource, athleteId, moduleId) {
    if (!resource.fileBlob) {
      throw new Error(
        `Il file locale “${resource.fileName || resource.title || resource.id}” non contiene più i byte da trasferire.`,
      );
    }

    const storagePath = this.storagePath(
      resource,
      athleteId,
      moduleId,
    );

    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(
        storagePath,
        resource.fileBlob,
        {
          contentType:
            resource.mimeType
            || resource.fileBlob.type
            || 'application/octet-stream',
          upsert: true,
        },
      );

    if (error) throw error;

    return storagePath;
  }

  async upsertCloudResource(resource) {
    const athleteId = clean(resource.athleteId) || this.athleteId();
    const moduleId = clean(resource.moduleId);

    if (!moduleId) throw new Error('Modulo della risorsa non specificato.');
    if (!clean(resource.id)) throw new Error('ID della risorsa non specificato.');

    this.assertWrite(moduleId);

    let storagePath = clean(resource.storagePath);

    if (resource.kind === 'file') {
      storagePath = await this.uploadFile(
        resource,
        athleteId,
        moduleId,
      );
    }

    const createdAt =
      clean(resource.createdAt)
      || new Date().toISOString();

    const { data, error } = await supabase
      .from('resource_library_items')
      .upsert(
        {
          athlete_id: athleteId,
          id: clean(resource.id),
          module_key: moduleId,
          kind: resource.kind === 'file' ? 'file' : 'link',
          link_type: resource.kind === 'file'
            ? null
            : (clean(resource.linkType) || 'web'),
          youtube_id: resource.kind === 'file'
            ? null
            : (clean(resource.youtubeId) || null),
          title: clean(resource.title),
          notes: clean(resource.notes),
          url: resource.kind === 'file'
            ? null
            : (clean(resource.url) || null),
          file_name: resource.kind === 'file'
            ? clean(resource.fileName)
            : null,
          mime_type: resource.kind === 'file'
            ? (clean(resource.mimeType) || null)
            : null,
          size_bytes: resource.kind === 'file'
            ? Math.max(0, Number(resource.size || resource.fileBlob?.size || 0))
            : 0,
          storage_path: resource.kind === 'file'
            ? storagePath
            : null,
          created_at: createdAt,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'athlete_id,id',
        },
      )
      .select(
        'athlete_id,id,module_key,kind,link_type,youtube_id,title,notes,url,file_name,mime_type,size_bytes,storage_path,created_at,updated_at',
      )
      .single();

    if (error) throw error;

    return mapRow(data);
  }

  async migrateLocalResources(
    moduleId,
    athleteId = this.athleteId(),
  ) {
    this.assertRead(moduleId);

    if (!this.localFallback || !canWriteModule(moduleId)) {
      return { migrated: 0, failed: 0 };
    }

    const localRows = await this.localResources(
      moduleId,
      athleteId,
    );

    if (!localRows.length) {
      return { migrated: 0, failed: 0 };
    }

    let existing = [];

    try {
      existing = await this.cloudResources(
        moduleId,
        athleteId,
      );
    } catch (error) {
      console.warn(
        `Cloud resource list unavailable for ${moduleId}; local copy retained.`,
        error,
      );

      return {
        migrated: 0,
        failed: localRows.length,
      };
    }

    const cloudIds = new Set(
      existing.map(resource => resource.id),
    );

    let migrated = 0;
    let failed = 0;

    for (const local of localRows) {
      try {
        if (!cloudIds.has(local.id)) {
          await this.upsertCloudResource({
            ...local,
            athleteId,
            moduleId,
          });
        }

        await this.localFallback.deleteResource(local.id);
        migrated += 1;
      } catch (error) {
        failed += 1;
        console.warn(
          `Resource migration failed: ${moduleId}/${local.id}`,
          error,
        );
      }
    }

    return { migrated, failed };
  }

  async migrateAllResources(moduleIds = []) {
    let migrated = 0;
    let failed = 0;

    for (const moduleId of moduleIds) {
      if (
        !canReadModule(moduleId)
        || !canWriteModule(moduleId)
      ) {
        continue;
      }

      const result = await this.migrateLocalResources(
        moduleId,
        this.athleteId(),
      );

      migrated += Number(result?.migrated || 0);
      failed += Number(result?.failed || 0);
    }

    return { migrated, failed };
  }

  async listResources(moduleId) {
    const athleteId = this.athleteId();
    this.assertRead(moduleId);

    if (canWriteModule(moduleId)) {
      await this.migrateLocalResources(
        moduleId,
        athleteId,
      );
    }

    try {
      const cloud = await this.cloudResources(
        moduleId,
        athleteId,
      );

      const local = await this.localResources(
        moduleId,
        athleteId,
      );

      const cloudIds = new Set(cloud.map(item => item.id));
      const pending = local
        .filter(item => !cloudIds.has(item.id))
        .map(item => ({
          ...cloneWithoutBlob(item),
          cloudPending: true,
        }));

      return [...cloud, ...pending];
    } catch (error) {
      console.warn(
        `Resource cloud unavailable for ${moduleId}; using local fallback.`,
        error,
      );

      return (await this.localResources(moduleId, athleteId))
        .map(item => ({
          ...cloneWithoutBlob(item),
          cloudPending: true,
        }));
    }
  }

  async getResource(id) {
    const athleteId = this.athleteId();

    try {
      const { data, error } = await supabase
        .from('resource_library_items')
        .select(
          'athlete_id,id,module_key,kind,link_type,youtube_id,title,notes,url,file_name,mime_type,size_bytes,storage_path,created_at,updated_at',
        )
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const resource = mapRow(data);
        this.assertRead(resource.moduleId);

        if (
          resource.kind === 'file'
          && resource.storagePath
        ) {
          const download = await supabase.storage
            .from(this.bucket)
            .download(resource.storagePath);

          if (download.error) throw download.error;

          resource.fileBlob = download.data;
        }

        return resource;
      }
    } catch (error) {
      console.warn(
        `Resource cloud read failed for ${id}; trying local fallback.`,
        error,
      );
    }

    return this.localFallback
      ? this.localFallback.getResource(id)
      : null;
  }

  async putResource(resource) {
    const moduleId = clean(resource?.moduleId);
    const athleteId = clean(resource?.athleteId) || this.athleteId();

    if (!moduleId) throw new Error('Modulo della risorsa non specificato.');

    this.assertWrite(moduleId);

    let localSaved = false;

    if (this.localFallback) {
      try {
        await this.localFallback.putResource({
          ...resource,
          athleteId,
          moduleId,
        });
        localSaved = true;
      } catch (error) {
        console.warn(
          'Unable to create offline resource copy; continuing with cloud upload.',
          error,
        );
      }
    }

    try {
      await this.upsertCloudResource({
        ...resource,
        athleteId,
        moduleId,
      });

      if (localSaved) {
        try {
          await this.localFallback.deleteResource(resource.id);
        } catch {
          // Cache cleanup is best-effort.
        }
      }
    } catch (error) {
      if (localSaved) {
        console.warn(
          'Resource saved locally and queued for a later cloud migration.',
          error,
        );
        return;
      }

      throw error;
    }
  }

  async deleteResource(id) {
    const athleteId = this.athleteId();

    const { data, error } = await supabase
      .from('resource_library_items')
      .select('module_key,storage_path')
      .eq('athlete_id', athleteId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      const local = this.localFallback
        ? await this.localFallback.getResource(id)
        : null;

      if (local) {
        this.assertWrite(local.moduleId);
        await this.localFallback.deleteResource(id);
        return;
      }

      throw error;
    }

    if (data) {
      this.assertWrite(data.module_key);

      const deletion = await supabase
        .from('resource_library_items')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('id', id);

      if (deletion.error) throw deletion.error;

      if (data.storage_path) {
        const removed = await supabase.storage
          .from(this.bucket)
          .remove([data.storage_path]);

        if (removed.error) {
          console.warn(
            `Resource binary cleanup failed for ${id}.`,
            removed.error,
          );
        }
      }
    }

    if (this.localFallback) {
      try {
        await this.localFallback.deleteResource(id);
      } catch {
        // Local cleanup is best-effort.
      }
    }
  }
}
