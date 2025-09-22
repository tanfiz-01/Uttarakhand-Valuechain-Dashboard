document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

async function initDashboard() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) {
      throw new Error(`Failed to load data.json (${response.status})`);
    }
    const payload = await response.json();
    const species = Array.isArray(payload.species) ? payload.species : [];
    const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
    initializeApp(species, recommendations);
  } catch (error) {
    console.error('Could not initialize the dashboard', error);
    const explorer = document.getElementById('explorer');
    if (explorer) {
      explorer.innerHTML = '<div class="w-full text-center bg-white border border-dashed border-red-300 text-red-600 font-semibold p-6 rounded-xl">Unable to load commodity data. Please check that data.json is present.</div>';
    }
  }
}

const VALID_LINKAGES = new Set(['Backward', 'Forward', 'Integrated']);

function normalizeSpecies(raw) {
  return {
    name: (raw.name || 'Unnamed Commodity').trim(),
    botanical: (raw.botanical || '').trim(),
    image: (raw.image || '').trim(),
    speciesType: (raw.speciesType || 'NTFP').trim(),
    habitat: (raw.habitat || '').trim(),
    conservation: (raw.conservation || '').trim(),
    districts: uniqueStrings(raw.districts),
    partsUsed: uniqueStrings(raw.partsUsed),
    products: uniqueStrings(raw.products),
    productFocus: (raw.productFocus || 'Other Value Chain').trim(),
    linkage: normalizeLinkage(raw.linkage),
    volume: (raw.volume || '').trim(),
    commercialValue: (raw.commercialValue || '').trim(),
    strength: (raw.strength || '').trim(),
    justification: (raw.justification || '').trim(),
  };
}

function normalizeLinkage(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) {
    return 'Integrated';
  }
  const capitalised = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  return VALID_LINKAGES.has(capitalised) ? capitalised : 'Integrated';
}

function uniqueStrings(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  }
  return Array.from(new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initializeApp(speciesData, recommendationsData) {
  if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }

  const species = speciesData.map(normalizeSpecies);
  const state = {
    search: '',
    speciesType: 'all',
    district: 'all',
    habitat: 'all',
    linkage: 'all',
    parts: new Set(),
  };

  const speciesGrid = document.getElementById('speciesGrid');
  const searchInput = document.getElementById('searchInput');
  const speciesTypeFilterGroup = document.getElementById('speciesTypeFilterGroup');
  const districtFilter = document.getElementById('districtFilter');
  const habitatFilter = document.getElementById('habitatFilter');
  const linkageFilterGroup = document.getElementById('linkageFilterGroup');
  const partsFilterContainer = document.getElementById('partsFilterContainer');
  const partsCheckboxList = document.getElementById('partsCheckboxList');
  const allPartsCheckbox = document.getElementById('all-parts-checkbox');
  const resultsCountEl = document.getElementById('resultsCount');
  const speciesCountEl = document.getElementById('speciesCount');
  const recommendationsContainer = document.getElementById('recommendationsContainer');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const closeModalBtn = document.getElementById('closeModal');
  const modalContent = modal ? modal.querySelector('.modal-content') : null;

  speciesCountEl.textContent = species.length.toString();

  populateDistrictFilter(species);
  populateHabitatFilter(species);
  populatePartsFilter(species);
  renderRecommendations(recommendationsData);
  renderSummaryCharts(species);
  applyFilters();

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    applyFilters();
  });

  speciesTypeFilterGroup.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }
    updateActiveButton(speciesTypeFilterGroup, button);
    state.speciesType = button.dataset.value;
    applyFilters();
  });

  linkageFilterGroup.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }
    updateActiveButton(linkageFilterGroup, button);
    state.linkage = button.dataset.value;
    applyFilters();
  });

  districtFilter.addEventListener('change', () => {
    state.district = districtFilter.value;
    applyFilters();
  });

  habitatFilter.addEventListener('change', () => {
    state.habitat = habitatFilter.value;
    applyFilters();
  });

  allPartsCheckbox.addEventListener('change', () => {
    if (allPartsCheckbox.checked) {
      state.parts.clear();
      partsCheckboxList.querySelectorAll('input.part-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
      });
      applyFilters();
    }
  });

  partsCheckboxList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input.part-checkbox');
    if (!checkbox) {
      return;
    }
    if (checkbox.checked) {
      state.parts.add(checkbox.value);
      allPartsCheckbox.checked = false;
    } else {
      state.parts.delete(checkbox.value);
      if (state.parts.size === 0) {
        allPartsCheckbox.checked = true;
      }
    }
    applyFilters();
  });

  closeModalBtn.addEventListener('click', hideModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      hideModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      hideModal();
    }
  });

  function populateDistrictFilter(collection) {
    const districts = Array.from(new Set(collection.flatMap((item) => item.districts))).sort((a, b) => a.localeCompare(b));
    districtFilter.innerHTML = '<option value="all">All districts</option>' + districts.map((district) => `<option value="${escapeHtml(district)}">${escapeHtml(district)}</option>`).join('');
  }

  function populateHabitatFilter(collection) {
    const habitats = Array.from(new Set(collection.map((item) => item.habitat).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    habitatFilter.innerHTML = '<option value="all">All habitats</option>' + habitats.map((habitat) => `<option value="${escapeHtml(habitat)}">${escapeHtml(habitat)}</option>`).join('');
  }

  function populatePartsFilter(collection) {
    const parts = Array.from(new Set(collection.flatMap((item) => item.partsUsed))).sort((a, b) => a.localeCompare(b));
    partsCheckboxList.innerHTML = '';
    parts.forEach((part) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'flex items-center gap-2';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `part-${part.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      checkbox.value = part;
      checkbox.className = 'part-checkbox h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer';

      const label = document.createElement('label');
      label.setAttribute('for', checkbox.id);
      label.className = 'text-sm text-slate-700 cursor-pointer';
      label.textContent = part;

      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      partsCheckboxList.appendChild(wrapper);
    });
  }

  function applyFilters() {
    const searchTerm = state.search.trim().toLowerCase();

    const filtered = species.filter((item) => {
      if (state.speciesType !== 'all' && item.speciesType !== state.speciesType) {
        return false;
      }
      if (state.district !== 'all' && !item.districts.includes(state.district)) {
        return false;
      }
      if (state.habitat !== 'all' && item.habitat !== state.habitat) {
        return false;
      }
      if (state.linkage !== 'all' && item.linkage !== state.linkage) {
        return false;
      }
      if (state.parts.size > 0) {
        const hasAllParts = Array.from(state.parts).every((part) => item.partsUsed.includes(part));
        if (!hasAllParts) {
          return false;
        }
      }
      if (searchTerm) {
        const haystack = [
          item.name,
          item.botanical,
          item.speciesType,
          item.habitat,
          item.productFocus,
          item.volume,
          item.commercialValue,
          item.strength,
          item.justification,
          item.districts.join(' '),
          item.partsUsed.join(' '),
          item.products.join(' '),
        ].join(' ').toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });

    renderSpecies(filtered);
    updateResultsCount(filtered.length);
  }

  function renderSpecies(collection) {
    speciesGrid.innerHTML = '';
    const template = document.getElementById('species-card-template');

    if (!collection.length) {
      speciesGrid.innerHTML = '<div class="col-span-full text-center bg-white border border-dashed border-slate-300 text-slate-500 p-6 rounded-xl">No commodities match the current filters. Try broadening your selection.</div>';
      return;
    }

    const sorted = [...collection].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach((item) => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector('article');
      const imageEl = clone.querySelector('.image');
      const linkageIndicator = clone.querySelector('.linkage-indicator');
      const speciesTypeBadge = clone.querySelector('.species-type-badge');
      const linkagePill = clone.querySelector('.linkage-pill');
      const habitatLabel = clone.querySelector('.habitat-label');
      const strengthEl = clone.querySelector('.strength');
      const productSnippetEl = clone.querySelector('.product-snippet');
      const districtTags = clone.querySelector('.district-tags');

      const placeholder = `https://placehold.co/600x400/e2e8f0/334155?text=${encodeURIComponent(item.name)}`;
      const imageSrc = item.image || placeholder;
      imageEl.src = imageSrc;
      imageEl.alt = `${item.name} image`;
      imageEl.onerror = () => {
        imageEl.src = placeholder;
      };

      const linkageMeta = getLinkageMeta(item.linkage);
      linkageIndicator.classList.add(linkageMeta.indicatorClass);
      linkageIndicator.title = linkageMeta.tooltip;

      speciesTypeBadge.textContent = item.speciesType;
      speciesTypeBadge.classList.add(item.speciesType === 'NTFP' ? 'ntfp' : 'agro-commodity');

      linkagePill.textContent = linkageMeta.pillLabel;
      linkagePill.classList.add(linkageMeta.pillClass);

      habitatLabel.textContent = item.habitat ? `Habitat: ${item.habitat}` : 'Habitat: Not specified';

      card.querySelector('.species-name').textContent = item.name;
      card.querySelector('.botanical-name').textContent = item.botanical || 'Botanical name unavailable';
      strengthEl.textContent = item.strength || 'No summary available for this commodity.';

      if (item.products.length) {
        const preview = item.products.slice(0, 3).join(', ');
        const suffix = item.products.length > 3 ? '…' : '';
        productSnippetEl.textContent = `Key products: ${preview}${suffix}`;
        productSnippetEl.innerHTML = productSnippetEl.textContent.replace('Key products:', '<span class="font-semibold text-slate-600">Key products:</span>');
      } else {
        productSnippetEl.textContent = '';
        productSnippetEl.innerHTML = '';
      }

      districtTags.innerHTML = item.districts
        .map((district) => `<span class="inline-block bg-slate-200 text-slate-700 text-xs font-medium px-2 py-0.5 rounded-full">${escapeHtml(district)}</span>`)
        .join('');

      card.addEventListener('click', () => openModal(item));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openModal(item);
        }
      });

      speciesGrid.appendChild(clone);
    });
  }

  function updateResultsCount(count) {
    if (!resultsCountEl) {
      return;
    }
    if (count === 0) {
      resultsCountEl.textContent = 'No commodities displayed';
      return;
    }
    resultsCountEl.textContent = `Showing ${count} of ${species.length} commodities`;
  }

  function renderRecommendations(recommendations) {
    recommendationsContainer.innerHTML = '';
    if (!recommendations.length) {
      recommendationsContainer.innerHTML = '<p class="col-span-full text-center text-slate-500 text-sm">No recommendation data available.</p>';
      return;
    }
    recommendations.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'bg-white rounded-xl shadow border border-slate-200 p-6 text-sm flex flex-col gap-3';
      const title = escapeHtml(item.title || 'Recommendation');
      card.innerHTML = `<h3 class="text-lg font-semibold text-blue-900">${title}</h3>${item.content || ''}`;
      recommendationsContainer.appendChild(card);
    });
  }

  function renderSummaryCharts(collection) {
    const linkageCounts = collection.reduce((acc, item) => {
      acc[item.linkage] = (acc[item.linkage] || 0) + 1;
      return acc;
    }, {});
    const linkageLabels = ['Backward', 'Forward', 'Integrated'];
    const linkageValues = linkageLabels.map((label) => linkageCounts[label] || 0);

    const linkageCtx = document.getElementById('linkageChart');
    if (linkageCtx) {
      new Chart(linkageCtx, {
        type: 'doughnut',
        data: {
          labels: linkageLabels,
          datasets: [
            {
              data: linkageValues,
              backgroundColor: ['#f97316', '#34d399', '#60a5fa'],
              borderColor: '#ffffff',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            datalabels: {
              color: '#ffffff',
              font: { weight: 'bold' },
              formatter: (value, context) => {
                const total = context.dataset.data.reduce((sum, current) => sum + current, 0);
                if (!total) {
                  return '';
                }
                const pct = Math.round((value / total) * 100);
                return pct >= 8 ? `${pct}%` : '';
              },
            },
          },
        },
      });
    }

    const speciesTypeCounts = collection.reduce((acc, item) => {
      acc[item.speciesType] = (acc[item.speciesType] || 0) + 1;
      return acc;
    }, {});
    const speciesTypeLabels = Object.keys(speciesTypeCounts);
    const speciesTypeValues = speciesTypeLabels.map((label) => speciesTypeCounts[label]);

    const speciesTypeCtx = document.getElementById('speciesTypeChart');
    if (speciesTypeCtx) {
      new Chart(speciesTypeCtx, {
        type: 'doughnut',
        data: {
          labels: speciesTypeLabels,
          datasets: [
            {
              data: speciesTypeValues,
              backgroundColor: ['#1d4ed8', '#7c3aed', '#facc15'],
              borderColor: '#ffffff',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            datalabels: {
              color: '#ffffff',
              font: { weight: 'bold' },
              formatter: (value, context) => {
                const total = context.dataset.data.reduce((sum, current) => sum + current, 0);
                if (!total) {
                  return '';
                }
                const pct = Math.round((value / total) * 100);
                return pct >= 10 ? `${pct}%` : '';
              },
            },
          },
        },
      });
    }

    const habitatCounts = collection.reduce((acc, item) => {
      const key = item.habitat || 'Not specified';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const habitatEntries = Object.entries(habitatCounts).sort((a, b) => b[1] - a[1]);

    const habitatCtx = document.getElementById('habitatChart');
    if (habitatCtx) {
      new Chart(habitatCtx, {
        type: 'bar',
        data: {
          labels: habitatEntries.map(([label]) => label),
          datasets: [
            {
              label: 'Commodities',
              data: habitatEntries.map(([, count]) => count),
              backgroundColor: '#2563eb',
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'end',
              color: '#1e3a8a',
              font: { weight: 'bold' },
            },
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });
    }
  }

  function openModal(item) {
    const linkageMeta = getLinkageMeta(item.linkage);
    const placeholder = `https://placehold.co/960x540/e2e8f0/334155?text=${encodeURIComponent(item.name)}`;
    const imageSrc = item.image || placeholder;

    modalTitle.textContent = `${item.name} (${item.botanical || 'Botanical name NA'})`;

    const productsList = item.products.length
      ? item.products.map((product) => `<li class="leading-snug">${escapeHtml(product)}</li>`).join('')
      : '<li class="leading-snug text-slate-500">No products documented.</li>';

    const partsList = item.partsUsed.length
      ? item.partsUsed.map((part) => `<li class="leading-snug">${escapeHtml(part)}</li>`).join('')
      : '<li class="leading-snug text-slate-500">Not documented.</li>';

    const districts = item.districts.length ? escapeHtml(item.districts.join(', ')) : 'Not specified';
    const conservation = item.conservation || 'Not assessed';

    modalBody.innerHTML = `
      <div class="space-y-6 text-sm text-slate-700">
        <div class="relative rounded-xl overflow-hidden shadow">
          <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.name)} image" class="w-full h-56 object-cover">
          <span class="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-white/85 text-slate-700 backdrop-blur-sm">${escapeHtml(linkageMeta.pillLabel)}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-3">
            <h4 class="text-base font-semibold text-blue-900">At a glance</h4>
            <ul class="space-y-1">
              <li><span class="font-semibold text-slate-600">Species type:</span> ${escapeHtml(item.speciesType)}</li>
              <li><span class="font-semibold text-slate-600">Habitat:</span> ${escapeHtml(item.habitat || 'Not specified')}</li>
              <li><span class="font-semibold text-slate-600">Districts:</span> ${districts}</li>
              <li><span class="font-semibold text-slate-600">Conservation status:</span> ${escapeHtml(conservation)}</li>
              <li><span class="font-semibold text-slate-600">Volume:</span> ${escapeHtml(item.volume || 'Not captured')}</li>
              <li><span class="font-semibold text-slate-600">Commercial value:</span> ${escapeHtml(item.commercialValue || 'Not captured')}</li>
            </ul>
            <div class="mt-4">
              <h5 class="text-sm font-semibold text-blue-900 mb-1">Strategic note</h5>
              <p class="leading-snug">${escapeHtml(item.justification || 'No detailed notes available for this commodity.')}</p>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <h5 class="text-sm font-semibold text-blue-900 mb-1">Value-added products</h5>
              <ul class="list-disc list-inside space-y-1">${productsList}</ul>
            </div>
            <div>
              <h5 class="text-sm font-semibold text-blue-900 mb-1">Plant parts utilised</h5>
              <ul class="list-disc list-inside space-y-1">${partsList}</ul>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('modal-open');
    if (modalContent) {
      modalContent.classList.remove('scale-95');
      modalContent.classList.add('scale-100');
    }
  }

  function hideModal() {
    if (modalContent) {
      modalContent.classList.remove('scale-100');
      modalContent.classList.add('scale-95');
    }
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('modal-open');
  }

  function updateActiveButton(container, activeButton) {
    container.querySelectorAll('button').forEach((button) => {
      button.classList.remove('active-filter');
      button.classList.add('inactive-filter');
    });
    activeButton.classList.add('active-filter');
    activeButton.classList.remove('inactive-filter');
  }

  function getLinkageMeta(linkage) {
    return {
      Backward: {
        indicatorClass: 'backward',
        pillClass: 'backward',
        pillLabel: 'Backward linkage',
        tooltip: 'Supply-side strengthening required.',
      },
      Forward: {
        indicatorClass: 'forward',
        pillClass: 'forward',
        pillLabel: 'Forward linkage',
        tooltip: 'Processing and market development required.',
      },
      Integrated: {
        indicatorClass: 'integrated',
        pillClass: 'integrated',
        pillLabel: 'Integrated linkage',
        tooltip: 'Balanced focus across supply and markets.',
      },
    }[linkage] || {
      indicatorClass: 'integrated',
      pillClass: 'integrated',
      pillLabel: 'Integrated linkage',
      tooltip: 'Balanced focus across supply and markets.',
    };
  }
}
