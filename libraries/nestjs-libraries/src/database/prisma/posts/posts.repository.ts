import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Post as PostBody } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import {
  APPROVED_SUBMIT_FOR_ORDER,
  CreationMethod,
  Post,
  State,
} from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import utc from 'dayjs/plugin/utc';
import { v4 as uuidv4 } from 'uuid';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import { createHash } from 'crypto';
import { NativeScheduledPost } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { AnalyticsOverviewDto } from '@gitroom/nestjs-libraries/dtos/analytics/overview.dto';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(isSameOrAfter);
dayjs.extend(utc);

type PostFilterQuery = {
  customer?: string;
  customers?: string;
  providers?: string;
  sources?: string;
  states?: string;
};

const splitCsv = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const buildPostFilter = (orgId: string, query: PostFilterQuery) => {
  const customers = splitCsv(query.customers || query.customer);
  const providers = splitCsv(query.providers);
  const sources = splitCsv(query.sources);
  const requestedStates = splitCsv(query.states);
  const states = new Set<State>();

  requestedStates.forEach((state) => {
    if (state === 'scheduled') {
      states.add(State.QUEUE);
      states.add(State.EXTERNAL);
      return;
    }

    const normalized = state.toUpperCase() as State;
    if (Object.values(State).includes(normalized)) {
      states.add(normalized);
    }
  });

  const onlyImported =
    sources.includes('imported') && !sources.includes('postiz');
  const onlyPostiz =
    sources.includes('postiz') && !sources.includes('imported');

  return {
    integration: {
      deletedAt: null,
      organizationId: orgId,
      ...(customers.length ? { customerId: { in: customers } } : {}),
      ...(providers.length ? { providerIdentifier: { in: providers } } : {}),
    },
    ...(states.size ? { state: { in: Array.from(states) } } : {}),
    ...(onlyImported ? { creationMethod: CreationMethod.IMPORTED } : {}),
    ...(onlyPostiz ? { creationMethod: { not: CreationMethod.IMPORTED } } : {}),
  };
};

@Injectable()
export class PostsRepository {
  constructor(
    private _post: PrismaRepository<'post'>,
    private _popularPosts: PrismaRepository<'popularPosts'>,
    private _comments: PrismaRepository<'comments'>,
    private _tags: PrismaRepository<'tags'>,
    private _tagsPosts: PrismaRepository<'tagsPosts'>,
    private _errors: PrismaRepository<'errors'>
  ) {}

  searchForMissingThreeHoursPosts() {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
          deletedAt: null,
        },
        publishDate: {
          gte: dayjs.utc().subtract(2, 'day').toDate(),
          lt: dayjs.utc().toDate(),
        },
        state: 'QUEUE',
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        organizationId: true,
        integration: {
          select: {
            providerIdentifier: true,
          },
        },
        publishDate: true,
      },
    });
  }

  getOldPosts(orgId: string, date: string) {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
        },
        organizationId: orgId,
        publishDate: {
          lte: dayjs(date).toDate(),
        },
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: {
        publishDate: 'desc',
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  updateImages(id: string, images: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        image: images,
      },
    });
  }

  getPostUrls(orgId: string, ids: string[]) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        releaseURL: true,
      },
    });
  }

  async getPosts(orgId: string, query: GetPostsDto) {
    // Use the provided start and end dates directly
    const startDate = dayjs.utc(query.startDate).toDate();
    const endDate = dayjs.utc(query.endDate).toDate();

    const list = await this._post.model.post.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                organizationId: orgId,
              },
            ],
          },
          {
            OR: [
              {
                publishDate: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              {
                intervalInDays: {
                  not: null,
                },
              },
            ],
          },
        ],
        ...buildPostFilter(orgId, query),
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        releaseId: true,
        state: true,
        intervalInDays: true,
        group: true,
        creationMethod: true,
        settings: true,
        tags: {
          select: {
            tag: true,
          },
        },
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
            name: true,
            picture: true,
          },
        },
      },
    });

    return list.reduce((all, post) => {
      if (!post.intervalInDays) {
        return [...all, post];
      }

      const addMorePosts = [];
      let startingDate = dayjs.utc(post.publishDate);
      while (dayjs.utc(endDate).isSameOrAfter(startingDate)) {
        if (dayjs(startingDate).isSameOrAfter(dayjs.utc(post.publishDate))) {
          addMorePosts.push({
            ...post,
            publishDate: startingDate.toDate(),
            actualDate: post.publishDate,
          });
        }

        startingDate = startingDate.add(post.intervalInDays, 'days');
      }

      return [...all, ...addMorePosts];
    }, [] as any[]);
  }

  async getPostsList(orgId: string, query: GetPostsListDto) {
    const page = query.page || 0;
    const limit = query.limit || 20;
    const skip = page * limit;

    const stateFilter = query.state || 'all';
    const stateAndDate =
      stateFilter === 'scheduled'
        ? {
            state: {
              in: [State.QUEUE, State.EXTERNAL],
            },
          }
        : stateFilter === 'draft'
        ? { state: State.DRAFT }
        : stateFilter === 'published'
        ? { state: State.PUBLISHED }
        : {
            state: {
              in: [
                State.QUEUE,
                State.DRAFT,
                State.PUBLISHED,
                State.ERROR,
                State.EXTERNAL,
              ],
            },
          };

    const orderDirection: 'asc' | 'desc' =
      stateFilter === 'published' ? 'desc' : 'asc';

    const where = {
      AND: [
        {
          OR: [
            {
              organizationId: orgId,
            },
          ],
        },
      ],
      ...stateAndDate,
      ...(query.startDate && query.endDate
        ? {
            publishDate: {
              gte: dayjs.utc(query.startDate).toDate(),
              lte: dayjs.utc(query.endDate).toDate(),
            },
          }
        : stateFilter === 'published'
        ? {}
        : { publishDate: { gte: dayjs.utc().toDate() } }),
      deletedAt: null as Date | null,
      parentPostId: null as string | null,
      intervalInDays: null as number | null,

      ...buildPostFilter(orgId, query),
    };

    const [posts, total] = await Promise.all([
      this._post.model.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          publishDate: orderDirection,
        },
        select: {
          id: true,
          content: true,
          publishDate: true,
          releaseURL: true,
          releaseId: true,
          state: true,
          intervalInDays: true,
          group: true,
          creationMethod: true,
          tags: {
            select: {
              tag: true,
            },
          },
          integration: {
            select: {
              id: true,
              providerIdentifier: true,
              name: true,
              picture: true,
            },
          },
        },
      }),
      this._post.model.post.count({ where }),
    ]);

    return {
      posts,
      total,
      page,
      limit,
      hasMore: skip + posts.length < total,
    };
  }

  async getAnalyticsOverview(orgId: string, query: AnalyticsOverviewDto) {
    const startDate = dayjs.utc(query.startDate).startOf('day');
    const endDate = dayjs.utc(query.endDate).endOf('day');
    const rangeInDays = Math.max(1, endDate.diff(startDate, 'day'));
    const granularity =
      rangeInDays <= 31 ? 'day' : rangeInDays <= 180 ? 'week' : 'month';

    const posts = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
        deletedAt: null,
        parentPostId: null,
        ...buildPostFilter(orgId, query),
      },
      select: {
        state: true,
        publishDate: true,
        creationMethod: true,
        integration: {
          select: {
            providerIdentifier: true,
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        publishDate: 'asc',
      },
    });

    const summary = {
      total: posts.length,
      scheduled: 0,
      published: 0,
      draft: 0,
      error: 0,
      imported: 0,
    };
    const series = new Map<
      string,
      {
        date: string;
        total: number;
        scheduled: number;
        published: number;
        error: number;
        imported: number;
      }
    >();
    const matrix = new Map<
      string,
      {
        customerId: string;
        customer: string;
        providers: Record<string, number>;
        total: number;
      }
    >();
    const providerTotals: Record<string, number> = {};

    const emptyBucket = (date: string) => ({
      date,
      total: 0,
      scheduled: 0,
      published: 0,
      error: 0,
      imported: 0,
    });
    let cursor =
      granularity === 'day'
        ? startDate.startOf('day')
        : granularity === 'week'
        ? startDate.startOf('isoWeek')
        : startDate.startOf('month');
    const lastBucket =
      granularity === 'day'
        ? endDate.startOf('day')
        : granularity === 'week'
        ? endDate.startOf('isoWeek')
        : endDate.startOf('month');
    while (cursor.isSame(lastBucket) || cursor.isBefore(lastBucket)) {
      const key = cursor.format('YYYY-MM-DD');
      series.set(key, emptyBucket(key));
      cursor = cursor.add(1, granularity);
    }

    posts.forEach((post) => {
      const scheduled =
        post.state === State.QUEUE || post.state === State.EXTERNAL;
      const imported = post.creationMethod === CreationMethod.IMPORTED;

      if (scheduled) summary.scheduled += 1;
      if (post.state === State.PUBLISHED) summary.published += 1;
      if (post.state === State.DRAFT) summary.draft += 1;
      if (post.state === State.ERROR) summary.error += 1;
      if (imported) summary.imported += 1;

      const publishedAt = dayjs.utc(post.publishDate);
      const bucketDate =
        granularity === 'day'
          ? publishedAt.startOf('day')
          : granularity === 'week'
          ? publishedAt.startOf('isoWeek')
          : publishedAt.startOf('month');
      const bucketKey = bucketDate.format('YYYY-MM-DD');
      const bucket = series.get(bucketKey) || emptyBucket(bucketKey);
      bucket.total += 1;
      if (scheduled) bucket.scheduled += 1;
      if (post.state === State.PUBLISHED) bucket.published += 1;
      if (post.state === State.ERROR) bucket.error += 1;
      if (imported) bucket.imported += 1;
      series.set(bucketKey, bucket);

      const customerId = post.integration.customer?.id || 'unclassified';
      const customer = post.integration.customer?.name || 'Non classifiés';
      const provider = post.integration.providerIdentifier;
      const row = matrix.get(customerId) || {
        customerId,
        customer,
        providers: {},
        total: 0,
      };
      row.providers[provider] = (row.providers[provider] || 0) + 1;
      row.total += 1;
      matrix.set(customerId, row);
      providerTotals[provider] = (providerTotals[provider] || 0) + 1;
    });

    return {
      summary,
      granularity,
      series: Array.from(series.values()),
      matrix: Array.from(matrix.values()).sort((a, b) =>
        a.customer.localeCompare(b.customer)
      ),
      providerTotals,
      providers: Object.keys(providerTotals).sort(),
    };
  }

  async deletePost(orgId: string, group: string) {
    await this._post.model.post.updateMany({
      where: {
        organizationId: orgId,
        group,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return this._post.model.post.findFirst({
      where: {
        organizationId: orgId,
        group,
        parentPostId: null,
      },
      select: {
        id: true,
      },
    });
  }

  getPostsByGroup(orgId: string, group: string) {
    return this._post.model.post.findMany({
      where: {
        group,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      include: {
        integration: true,
        tags: {
          select: {
            tag: true,
          },
        },
      },
    });
  }

  getPost(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      include: {
        ...(includeIntegration
          ? {
              integration: true,
              tags: {
                select: {
                  tag: true,
                },
              },
            }
          : {}),
        childrenPost: true,
      },
    });
  }

  updatePost(id: string, postId: string, releaseURL: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state: 'PUBLISHED',
        releaseURL,
        releaseId: postId,
      },
    });
  }

  updateReleaseId(id: string, orgId: string, releaseId: string) {
    return this._post.model.post.update({
      where: {
        id,
        organizationId: orgId,
        releaseId: 'missing',
      },
      data: {
        releaseId: String(releaseId),
      },
    });
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const update = await this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state,
        ...(err
          ? { error: typeof err === 'string' ? err : JSON.stringify(err) }
          : {}),
      },
      include: {
        integration: {
          select: {
            providerIdentifier: true,
          },
        },
      },
    });

    if (state === 'ERROR' && err && body) {
      try {
        await this._errors.model.errors.create({
          data: {
            message: typeof err === 'string' ? err : JSON.stringify(err),
            organizationId: update.organizationId,
            platform: update.integration.providerIdentifier,
            postId: update.id,
            body: typeof body === 'string' ? body : JSON.stringify(body),
          },
        });
      } catch (err) {}
    }

    return update;
  }

  getErrorsByPostIds(postIds: string[]) {
    return this._errors.model.errors.findMany({
      where: {
        postId: { in: postIds },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    isDraft: boolean,
    action: 'schedule' | 'update' = 'schedule'
  ) {
    return this._post.model.post.update({
      where: {
        organizationId: orgId,
        id,
      },
      data: {
        publishDate: dayjs(date).toDate(),
        // schedule: set state to QUEUE (or DRAFT if it was a draft)
        // update: don't change the state
        ...(action === 'schedule'
          ? {
              state: isDraft ? 'DRAFT' : 'QUEUE',
              releaseId: null,
              releaseURL: null,
            }
          : {}),
      },
    });
  }

  countPostsFromDay(orgId: string, date: Date) {
    return this._post.model.post.count({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: date,
        },
        OR: [
          {
            deletedAt: null,
            state: {
              in: ['QUEUE'],
            },
          },
          {
            state: 'PUBLISHED',
          },
        ],
      },
    });
  }

  async syncImportedScheduledPosts(
    orgId: string,
    integrationId: string,
    providerIdentifier: string,
    scheduledPosts: NativeScheduledPost[]
  ) {
    const existing = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        integrationId,
        creationMethod: CreationMethod.IMPORTED,
      },
      select: {
        id: true,
        releaseId: true,
        deletedAt: true,
      },
    });
    const existingIds = new Set(existing.map((post) => post.id));
    const nativeIds = new Set(scheduledPosts.map((post) => post.id));
    let created = 0;

    for (const scheduledPost of scheduledPosts) {
      const hash = createHash('sha256')
        .update(`${integrationId}:${scheduledPost.id}`)
        .digest('hex')
        .slice(0, 24);
      const id = `native_${hash}`;
      const data = {
        state: State.EXTERNAL,
        publishDate: scheduledPost.publishDate,
        content: scheduledPost.content,
        group: id,
        releaseId: scheduledPost.id,
        releaseURL: scheduledPost.releaseURL || null,
        settings: JSON.stringify({
          ...(scheduledPost.settings || {}),
          __type: providerIdentifier,
          __nativeScheduled: true,
          __nativeId: scheduledPost.id,
        }),
        image: JSON.stringify(scheduledPost.image || []),
        creationMethod: CreationMethod.IMPORTED,
        deletedAt: null,
      };

      if (!existingIds.has(id)) {
        created += 1;
      }

      await this._post.model.post.upsert({
        where: { id },
        create: {
          id,
          ...data,
          approvedSubmitForOrder: APPROVED_SUBMIT_FOR_ORDER.NO,
          organization: { connect: { id: orgId } },
          integration: {
            connect: { id: integrationId, organizationId: orgId },
          },
        },
        update: data,
      });
    }

    const staleIds = existing
      .filter(
        (post) =>
          !post.deletedAt && !!post.releaseId && !nativeIds.has(post.releaseId)
      )
      .map((post) => post.id);
    if (staleIds.length) {
      await this._post.model.post.updateMany({
        where: {
          id: { in: staleIds },
          organizationId: orgId,
          integrationId,
          creationMethod: CreationMethod.IMPORTED,
        },
        data: { deletedAt: new Date() },
      });
    }

    return {
      created,
      updated: scheduledPosts.length - created,
      removed: staleIds.length,
    };
  }

  async createOrUpdatePost(
    state: 'draft' | 'schedule' | 'now' | 'update',
    orgId: string,
    date: string,
    body: PostBody,
    tags: { value: string; label: string }[],
    creationMethod: CreationMethod,
    inter?: number,
    // Keep the existing group instead of rotating it, so open clients
    // (calendar) holding the group stay valid. Used by out-of-band updates
    // (agent / MCP / public API); the dashboard keeps the rotate-and-sweep.
    keepGroup = false
  ) {
    const posts: Post[] = [];
    const uuid = uuidv4();
    const group = keepGroup && body.group ? body.group : uuid;

    for (const value of body.value) {
      const updateData = (type: 'create' | 'update') => ({
        publishDate: dayjs(date).toDate(),
        integration: {
          connect: {
            id: body.integration.id,
            organizationId: orgId,
          },
        },
        ...(posts?.[posts.length - 1]?.id
          ? {
              parentPost: {
                connect: {
                  id: posts[posts.length - 1]?.id,
                },
              },
            }
          : type === 'update'
          ? {
              parentPost: {
                disconnect: true,
              },
            }
          : {}),
        content: value.content,
        delay: value.delay || 0,
        group,
        intervalInDays: inter ? +inter : null,
        approvedSubmitForOrder: APPROVED_SUBMIT_FOR_ORDER.NO,
        ...(type === 'create' ? { creationMethod } : {}),
        ...(state === 'update'
          ? {}
          : {
              state:
                state === 'draft' ? ('DRAFT' as const) : ('QUEUE' as const),
            }),
        image: JSON.stringify(value.image),
        settings: JSON.stringify(body.settings),
        organization: {
          connect: {
            id: orgId,
          },
        },
      });

      posts.push(
        await this._post.model.post.upsert({
          where: {
            id: value.id || uuidv4(),
          },
          create: { ...updateData('create') },
          update: {
            ...updateData('update'),
            lastMessage: {
              disconnect: true,
            },
            submittedForOrder: {
              disconnect: true,
            },
          },
        })
      );

      if (posts.length === 1) {
        await this._tagsPosts.model.tagsPosts.deleteMany({
          where: {
            post: {
              id: posts[0].id,
            },
          },
        });

        if (tags.length) {
          const tagsList = await this._tags.model.tags.findMany({
            where: {
              orgId: orgId,
              name: {
                in: tags.map((tag) => tag.label).filter((f) => f),
              },
            },
          });

          if (tagsList.length) {
            await this._post.model.post.update({
              where: {
                id: posts[posts.length - 1].id,
              },
              data: {
                tags: {
                  createMany: {
                    data: tagsList.map((tag) => ({
                      tagId: tag.id,
                    })),
                  },
                },
              },
            });
          }
        }
      }
    }

    const previousPost = body.group
      ? (
          await this._post.model.post.findFirst({
            where: {
              group: body.group,
              deletedAt: null,
              parentPostId: null,
            },
            select: {
              id: true,
            },
          })
        )?.id!
      : undefined;

    if (body.group && !keepGroup) {
      await this._post.model.post.updateMany({
        where: {
          group: body.group,
          deletedAt: null,
        },
        data: {
          parentPostId: null,
          deletedAt: new Date(),
        },
      });
    }

    // keepGroup: the updated rows still carry the old group, so sweep only the
    // rows dropped from it (removed comments) by id instead of by group.
    if (body.group && keepGroup) {
      await this._post.model.post.updateMany({
        where: {
          group: body.group,
          deletedAt: null,
          id: {
            notIn: posts.map((p) => p.id),
          },
        },
        data: {
          parentPostId: null,
          deletedAt: new Date(),
        },
      });
    }

    return { previousPost, posts };
  }

  async submit(id: string, order: string, buyerOrganizationId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        submittedForOrderId: order,
        approvedSubmitForOrder: 'WAITING_CONFIRMATION',
        submittedForOrganizationId: buyerOrganizationId,
      },
      select: {
        id: true,
        description: true,
        submittedForOrder: {
          select: {
            messageGroupId: true,
          },
        },
      },
    });
  }

  updateMessage(id: string, messageId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        lastMessageId: messageId,
      },
    });
  }

  getPostById(id: string, org?: string) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(org ? { organizationId: org } : {}),
      },
      include: {
        integration: true,
        submittedForOrder: {
          include: {
            posts: {
              where: {
                state: 'PUBLISHED',
              },
            },
            ordersItems: true,
            seller: {
              select: {
                id: true,
                account: true,
              },
            },
          },
        },
      },
    });
  }

  findAllExistingCategories() {
    return this._popularPosts.model.popularPosts.findMany({
      select: {
        category: true,
      },
      distinct: ['category'],
    });
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
      },
      select: {
        topic: true,
      },
      distinct: ['topic'],
    });
  }

  findPopularPosts(category: string, topic?: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
        ...(topic ? { topic } : {}),
      },
      select: {
        content: true,
        hook: true,
      },
    });
  }

  createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._popularPosts.model.popularPosts.create({
      data: {
        category: 'category',
        topic: 'topic',
        content: 'content',
        hook: 'hook',
      },
    });
  }

  async getPostsCountsByDates(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs
  ) {
    const dates = await this._post.model.post.findMany({
      where: {
        deletedAt: null,
        organizationId: orgId,
        publishDate: {
          in: times.map((time) => {
            return date.clone().add(time, 'minutes').toDate();
          }),
        },
      },
    });

    return times.filter(
      (time) =>
        date.clone().add(time, 'minutes').isAfter(dayjs.utc()) &&
        !dates.find((dateFind) => {
          return (
            dayjs
              .utc(dateFind.publishDate)
              .diff(date.clone().startOf('day'), 'minutes') == time
          );
        })
    );
  }

  async getComments(postId: string) {
    return this._comments.model.comments.findMany({
      where: {
        postId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async getTags(orgId: string) {
    return this._tags.model.tags.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
    });
  }

  createTag(orgId: string, body: CreateTagDto) {
    return this._tags.model.tags.create({
      data: {
        orgId,
        name: body.name,
        color: body.color,
      },
    });
  }

  editTag(id: string, orgId: string, body: CreateTagDto) {
    return this._tags.model.tags.update({
      where: {
        id,
      },
      data: {
        name: body.name,
        color: body.color,
      },
    });
  }

  deleteTag(id: string, orgId: string) {
    return this._tags.model.tags.update({
      where: {
        id,
        orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  createComment(
    orgId: string,
    userId: string,
    postId: string,
    content: string
  ) {
    return this._comments.model.comments.create({
      data: {
        organizationId: orgId,
        userId,
        postId,
        content,
      },
    });
  }

  async getPostByForWebhookId(postId: string) {
    return this._post.model.post.findMany({
      where: {
        id: postId,
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  async getPostsSince(orgId: string, since: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: new Date(since),
        },
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }
}
