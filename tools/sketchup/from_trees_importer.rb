# From Trees Cabinet Designer importer. Runs inside SketchUp Desktop's Ruby API.
# No remote code, eval, shell commands, plugins or solid-tool license required.
require 'json'
require 'base64'

module FromTrees
  module CabinetImport
    DICTIONARY = 'from_trees_fabrication'.freeze
    MAX_PARTS = 5000

    def self.number(value)
      raise ArgumentError, 'Invalid numeric value' unless value.is_a?(Numeric) && value.finite?
      value.to_f
    end

    def self.vector(value, positive = false)
      raise ArgumentError, 'Expected three coordinates' unless value.is_a?(Array) && value.length == 3
      result = value.map { |v| number(v) }
      raise ArgumentError, 'Part size must be positive' if positive && result.any? { |v| v <= 0 }
      result
    end

    def self.validate(data)
      raise ArgumentError, 'Unsupported export version' unless data['schema'] == 'from-trees-fabrication' && data['version'] == 1 && data['units'] == 'in'
      raise ArgumentError, 'Invalid part count' unless data['parts'].is_a?(Array) && data['parts'].length.between?(1, MAX_PARTS)
      ids = data.fetch('assemblies').map { |a| a.fetch('id') }
      raise ArgumentError, 'Duplicate cabinet IDs' unless ids.uniq.length == ids.length
      data['assemblies'].each { |a| vector(a.fetch('origin')); number(a.fetch('rotation')) }
      part_ids = []
      data['parts'].each do |part|
        raise ArgumentError, 'Unknown cabinet' unless ids.include?(part['assemblyId'])
        part_ids << part.fetch('id')
        vector(part.fetch('origin'))
        size = vector(part.fetch('size'), true)
        raise ArgumentError, 'Invalid grain axis' unless [0, 1, 2].include?(part['grainAxis'])
        raise ArgumentError, 'Too many machining pockets' unless part.fetch('pockets').is_a?(Array) && part['pockets'].length <= 100
        part['pockets'].each do |pocket|
          origin = vector(pocket.fetch('origin'))
          dimensions = vector(pocket.fetch('size'), true)
          raise ArgumentError, 'Machining outside stock' if 3.times.any? { |i| origin[i] < -0.001 || origin[i] + dimensions[i] > size[i] + 0.001 }
        end
      end
      raise ArgumentError, 'Duplicate part IDs' unless part_ids.uniq.length == part_ids.length
      data
    end

    def self.stock_axes(part)
      remaining = [0, 1, 2] - [part.fetch('grainAxis')]
      thickness = remaining.min_by { |i| part['size'][i] }
      [part['grainAxis'], (remaining - [thickness]).first, thickness]
    end

    # Build the boundary of rectangular stock minus rectangular pockets. Shared
    # grid vertices/edges make closed solids without Pro-only Boolean operations.
    def self.solid(entities, size, pockets)
      grid = 3.times.map do |axis|
        ([0.0, size[axis]] + pockets.flat_map { |p| [p['origin'][axis], p['origin'][axis] + p['size'][axis]] })
          .map { |v| [[v, 0.0].max, size[axis]].min.to_f.round(8) }.sort.uniq
      end
      counts = grid.map { |values| values.length - 1 }
      raise ArgumentError, 'Machining is too complex' if counts.inject(:*) > 100_000
      occupied = {}
      counts[0].times do |i|
        counts[1].times do |j|
          counts[2].times do |k|
            indices = [i, j, k]
            center = 3.times.map { |a| (grid[a][indices[a]] + grid[a][indices[a] + 1]) / 2 }
            removed = pockets.any? { |p| 3.times.all? { |a| center[a] > p['origin'][a] - 1e-8 && center[a] < p['origin'][a] + p['size'][a] + 1e-8 } }
            occupied[indices] = true unless removed
          end
        end
      end
      raise ArgumentError, 'Machining removed the entire part' if occupied.empty?
      # Outward-wound faces of each occupied grid cell, only at exposed boundaries.
      faces = [
        [[-1, 0, 0], [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
        [[1, 0, 0], [[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],
        [[0,-1,0], [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
        [[0,1,0], [[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],
        [[0,0,-1], [[0,0,0],[0,1,0],[1,1,0],[1,0,0]]],
        [[0,0,1], [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]]
      ]
      entities.build do |builder|
      occupied.each_key do |indices|
        faces.each do |offset, corners|
          neighbor = 3.times.map { |a| indices[a] + offset[a] }
          next if occupied[neighbor]
          points = corners.map { |corner| 3.times.map { |a| grid[a][indices[a] + corner[a]] } }
          face = builder.add_face(points)
          raise ArgumentError, 'Could not construct a machining face' unless face
          face.reverse! if face.normal.dot(Geom::Vector3d.new(offset)) < 0
        end
      end
      end
      entities.grep(Sketchup::Edge).each do |edge|
        if edge.faces.length == 2 && edge.faces[0].normal.dot(edge.faces[1].normal) > 0.999999
          edge.hidden = true
        end
      end
    end

    def self.import(data, model = Sketchup.active_model)
      raise ArgumentError, 'SketchUp Desktop 2022 or newer is required' unless model.entities.respond_to?(:build)
      validate(data)
      model.start_operation('Import From Trees cabinet design', true)
      begin
        root = model.entities.add_group
        root.name = "From Trees #{data['design']['slug'][0,8]} r#{data['design']['revision']}"
        root.set_attribute(DICTIONARY, 'manifest', JSON.generate(data))
        cabinets = {}
        data['assemblies'].each do |assembly|
          definition = model.definitions.add("FT Cabinet #{assembly['id']}")
          rotation = Geom::Transformation.rotation(ORIGIN, Z_AXIS, assembly['rotation'] * Math::PI / 180)
          instance = root.entities.add_instance(definition, Geom::Transformation.translation(assembly['origin']) * rotation)
          instance.name = assembly['name']
          instance.set_attribute(DICTIONARY, 'assembly_id', assembly['id'])
          cabinets[assembly['id']] = definition
        end
        definitions = {}
        data['parts'].each do |part|
          axes = stock_axes(part)
          size = axes.map { |i| part['size'][i] }
          pockets = part['pockets'].map { |p| {'origin' => axes.map { |i| p['origin'][i] }, 'size' => axes.map { |i| p['size'][i] }} }
          key = JSON.generate([part['name'], part['material'], part['stockType'], size, pockets])
          definition = definitions[key]
          unless definition
            definition = model.definitions.add("FT #{part['name']} #{size.map { |v| format('%.4f', v) }.join(' x ')}")
            solid(definition.entities, size, pockets)
            definitions[key] = definition
            definition.set_attribute(DICTIONARY, 'stock_type', part['stockType'])
            definition.set_attribute(DICTIONARY, 'stock_dimensions', size)
            definition.set_attribute(DICTIONARY, 'machining', JSON.generate(part['pockets']))
            definition.description = "#{part['material']}; grain along local red axis; inches"
          end
          red = Geom::Vector3d.new(3.times.map { |i| i == axes[0] ? 1 : 0 })
          blue = Geom::Vector3d.new(3.times.map { |i| i == axes[2] ? 1 : 0 })
          green = blue.cross(red)
          origin = part['origin'].dup
          origin[axes[1]] += size[1] if green.to_a[axes[1]] < 0
          transform = Geom::Transformation.axes(Geom::Point3d.new(origin), red, green, blue)
          # If green was reversed, stock machining coordinates must also reverse.
          # Build a reflected local machining copy rather than mirror the instance.
          if green.to_a[axes[1]] < 0
            reflected = pockets.map { |p| {'origin'=>[p['origin'][0], size[1]-p['origin'][1]-p['size'][1], p['origin'][2]], 'size'=>p['size']} }
            reflected_key = key + ':reverse-width'
            definition = definitions[reflected_key]
            unless definition
              definition = model.definitions.add("FT #{part['name']} (oriented)")
              solid(definition.entities,size,reflected)
              definition.set_attribute(DICTIONARY, 'stock_type', part['stockType'])
              definition.set_attribute(DICTIONARY, 'stock_dimensions', size)
              definition.set_attribute(DICTIONARY, 'machining', JSON.generate(part['pockets']))
              definition.description = "#{part['material']}; grain along local red axis; inches"
              definitions[reflected_key] = definition
            end
          end
          instance = cabinets.fetch(part['assemblyId']).entities.add_instance(definition, transform)
          instance.name = part['name']
          instance.set_attribute(DICTIONARY, 'part_id', part['id'])
          instance.set_attribute(DICTIONARY, 'cabinet_id', part['assemblyId'])
          material_name = "#{part['material']} (#{part['stockType']} stock)"
          material = model.materials[material_name]
          unless material
            material = model.materials.add(material_name)
            material.color = part['stockType'] == 'solid' ? [190, 158, 113] : [219, 205, 177]
          end
          # Configure a newly created material through OpenCutList's API when
          # installed, without changing an existing user's material settings.
          if defined?(Ladb::OpenCutList::MaterialAttributes) && !material.get_attribute(DICTIONARY, 'configured')
            attributes = Ladb::OpenCutList::MaterialAttributes.new(material)
            if attributes.type == Ladb::OpenCutList::MaterialAttributes::TYPE_UNKNOWN
              attributes.type = {'sheet'=>2, 'solid'=>1, 'hardware'=>5}.fetch(part['stockType'])
              attributes.grained = part['stockType'] != 'hardware'
              attributes.write_to_attributes
            end
            material.set_attribute(DICTIONARY, 'configured', true)
          end
          instance.material = material
          raise ArgumentError, "Non-solid component: #{part['name']}" unless instance.manifold? && instance.volume > 0
          expected = size.sort
          actual = [definition.bounds.width, definition.bounds.height, definition.bounds.depth].map(&:to_f).sort
          raise ArgumentError, "Stock dimensions changed: #{part['name']}" unless 3.times.all? { |i| (expected[i]-actual[i]).abs < 0.001 }
        end
        model.commit_operation
        root
      rescue Exception
        model.abort_operation
        raise
      end
    end

    def self.run(data)
      root = import(data)
      Sketchup.active_model.active_view.zoom(root)
      UI.messagebox("Imported #{data['parts'].length} solid components. Construction assumptions are stored on the model. Review the model and configure materials in OpenCutList before cutting.")
      destination = UI.savepanel('Save cabinet model', nil, "From-Trees-#{data['design']['slug'][0,8]}-r#{data['design']['revision']}.skp")
      raise IOError, 'SketchUp could not save the model' if destination && !Sketchup.active_model.save(destination)
    rescue StandardError => error
      UI.messagebox("From Trees import failed: #{error.message}")
    end
  end
end
